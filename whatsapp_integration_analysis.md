# Care Plan & Marketplace Architecture Analysis

This document outlines the database collections, user flows, and suggestions for WhatsApp integration regarding the Care Plan and Marketplace features.

## 1. Database Collections & Architectural Changes

Here are the key collections that drive the Care Plans, Marketplace, and daily logging. 

### Care Plan Definitions & Enrollments
- **`CarePlan`**: This is the blueprint for a 30-day (or variable) program. It is surfaced in the Marketplace. It stores the `scoring_rules`, `reward_tiers`, `duration_days`, and weekly themes.
- **`CarePlanAssignment`**: This tracks a specific patient’s enrollment in a `CarePlan`. This is the most frequently updated collection for daily activities.
  - **`day_logs` array**: Tracks daily progress natively. Contains fields like:
    - `fasting_sugar`: Number or null
    - `postmeal_sugar`: Number or null
    - `meds_taken`: Boolean (True only if *all* daily medications are taken)
    - `meds_taken_list`: Array of strings
    - `meals_logged`: Number of meals
    - `foot_check_done` & `workout_logged`: Booleans
  - **`mhp_balance` & `mhp_tier`**: Tracks Mediimate Health Points (MHP) for gamification.
  - **`streak_days` & `last_log_date`**: For calculating daily streaks natively.

### Logging Collections
- **`Patient`**: The `daily_med_status` object stores real-time medication flags.
  - Format: `{ date: "YYYY-MM-DD", statuses: [{ medicine: "Name", status: "taken" | "pending" }] }`. This keeps track of partial medication adherence.
- **`MedicationLog`**: A historical append-only log of every medication taken/skipped.
  - Format: `{ taken: Boolean, medication_name: String, source: "careplan" | "whatsapp" }`
- **`Vital`**: Stores discrete medical readings (like fasting/postmeal blood sugar).
  - Format: `{ vital_type: "blood_sugar", value_numeric: Number, source: "careplan" }`.
- **`FoodLog`**: Stores meal logs. 
- **`PatientGamification`**: Accumulates global health points, total logs, and longest streaks beyond just a single Care Plan.
- **`ReminderEscalation`**: A layered tracking system for smart reminders. Tracks `day1_sent_at`, `day2_sent_at`, and triggers an `Alert` for doctors if escalation reaches a threshold (Layer 2/3 smart reminders).

---

## 2. User Flows & API Interactions

Here is a mapped user flow detailing exactly how things move through the backend when a user interacts with their Care Plan dashboard.

### A. Viewing the Active Care Plan
**API**: `GET /me/careplan`
1. **Reads `CarePlanAssignment`**: To get the active user's enrollment.
2. **Reads `CarePlan`**: To fetch the blueprint (duration, themes).
3. **Reads `Patient`**: Specifically checks `daily_med_status` to determine what medicines are taken today.
4. **Reads `Vital` & `FoodLog`**: Cross-references any vitals submitted outside of the care plan dashboard (e.g., via a separate Vitals page) for the current day.
5. **Output**: Returns the `assignment`, combined `today_tasks` booleans, and the unformatted `medications_status`.

### B. Logging an Action (Vitals/Meds/Food)
**API**: `POST /me/careplan/:assignmentId/log-action`
1. **Validates & Updates `CarePlanAssignment`**: 
   - Finds today's log in the `day_logs` array.
   - If `medicine_confirm`: Checks the `Patient.daily_med_status`. Updates specific medicines inside `Patient` to "taken". If all are taken, flags `todayLog.meds_taken = true`.
   - Adds points to `mhp_balance` and logs an entry to `mhp_history`.
   - Recalculates `streak_days`.
2. **Writes to Append-Only Collections**:
   - Depending on the action, it creates a new record in `Vital` (for sugars), `FoodLog` (for meals), or `MedicationLog` (for medicines).
3. **Updates `PatientGamification`**: Increments `total_points` and total counters natively.
4. **Writes `Notification`**: If a new Gamification Tier is unlocked (Bronze/Silver/Gold), a Push Notification document is created.

### C. Voice Transcriptions
**API**: `POST /me/careplan/:assignmentId/voice-log`
1. The frontend records a voice fragment and sends it to the server.
2. The server reads the patient's current `medications` from the `Patient` document.
3. The server sends the audio buffer + the medication list to **Gemini 2.5 Flash** with a strict prompt to return a JSON array indicating which actions the user is trying to log (e.g., `[{"action": "fasting_sugar_log", "value": 110}]`).
4. **No DB modification occurs here**. The frontend receives the JSON intent and then makes individual calls to `POST /log-action` for confirmation.

### D. Complication Screening
**API**: `POST /me/careplan/:assignmentId/screen-complication`
1. **Updates `CarePlanAssignment`**: Updates boolean flags like `complications_screened.eye = true`. Awards MHP points.
2. **Writes `Alert`**: If the user reported "concerning" symptoms during the screening, an `Alert` document is created to notify the Doctor/Clinic immediately.

---

## 3. WhatsApp Integration Ideas

The database schema is already highly compatible with WhatsApp integration (e.g., the `source` fields in `Vital`, `FoodLog` and `MedicationLog` accept `"whatsapp"`). 

To fully harness this and build a highly responsive background agent, here are architectural and feature suggestions:

### Core Features

**1. Interactive Reminder Buttons**
Send automated WhatsApp templates natively through the WhatsApp Business API with Quick Reply buttons:
   * **Message**: "Good morning! Did you take your Amlodipine 5mg?"
   * **Buttons**: `[Yes, I took it]` `[No, skipped it]`
   * **Backend Flow**: A webhook receives the button payload and calls the exact same `log-action` logic, creating a `MedicationLog` piece and awarding MHP silently.

**2. Natural Language Photo & Text Logging**
   * Users can snap a photo of their lunch or text "My fasting sugar is 112".
   * **Backend Flow**: Pass the WhatsApp text/image to the existing Gemini 2.5 Flash pipeline. Gemini extracts the intent `{"action": "fasting_sugar_log", "value": 112}`. The system logs it automatically and responds playfully: *"Got it! 112 mg/dL. I've added 20 MHP to your Care Plan balance! Keep your 5-day streak going! 🔥"*

**3. Gentle Escalation Triggers**
   * Use the `ReminderEscalation` collection. If a user doesn't log fasting sugar by 10:00 AM, the system sends an automated WhatsApp ping.
   * If they miss 3 days in a row, the WhatsApp bot can offer empathy: "I noticed you haven't logged recently. Is everything okay? Reply 'Need Help' to connect with your coordinator."

### Architectural Suggestions for WhatsApp

1. **Adopt a Webhook Ingress Route**
   - Create a new route `POST /webhooks/whatsapp`.
   - Parse incoming messages/button-clicks.
   - Use the phone number attached to the WhatsApp payload to look up the `Patient`.

2. **Decouple the Gamification Logic**
   - Move the MHP calculation and gamification tier logic (currently tightly coupled in `/log-action`) into a shared generalized service function (e.g., `GamificationService.awardPoints()`).
   - This ensures that if a user logs via WhatsApp, they still get Push Notifications on their app and points added to their `CarePlanAssignment` perfectly.

3. **Contextual Memory**
   - Maintain the `ChatConversation` collection. When a user sends a message via WhatsApp, append it to their context window. If they say "My leg hurts", the system logs a `HealthNote` with `source="whatsapp"` and a Doctor `Alert`.

By using WhatsApp as a seamless entry point, you are guaranteeing patient engagement without forcing them to open the Progressive Web App every day, resolving high friction points for older demographics.
