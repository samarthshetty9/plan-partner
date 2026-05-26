/**
 * Seeds the Care Plan feature: creates 30-Day Diabetes careplan, demo patient user,
 * and 5 careplan assignments with realistic day_logs for days 1-14.
 * Run: cd server && npx tsx scripts/seed-careplan.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  AuthUser,
  UserRole,
  Profile,
  Patient,
  PatientGamification,
  Vital,
  Notification,
  CarePlan,
  CarePlanAssignment,
} from "../models/index.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/plan-partner";
const DOCTOR_ID = process.env.SEED_DOCTOR_USER_ID || "e0697d5c-a726-4e3e-8da3-ee72b99f6999";

// Demo user that will be created for viewing the care plan
const DEMO_EMAIL = "demo@mediimate.in";
const DEMO_PASSWORD = "Demo1234!";

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateNDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  // ─── 1. Create 30-Day Diabetes CarePlan ───
  const existingPlan = await CarePlan.findOne({ slug: "30-day-diabetes" });
  if (existingPlan) {
    await CarePlan.deleteOne({ _id: existingPlan._id });
    console.log("Removed existing 30-day-diabetes care plan");
  }

  const careplan = await CarePlan.create({
    name: "30-Day Diabetes Chronic Care Program",
    slug: "30-day-diabetes",
    condition: "Type 2 Diabetes",
    duration_days: 30,
    is_active: true,
    description:
      "A structured 30-day program with daily check-ins, sugar tracking, medicine adherence, complication screening, and MHP reward points.",
    cover_color: "#16a34a",
    scoring_rules: {
      fasting_sugar_log: 10,
      postmeal_sugar_log: 10,
      medicine_confirm: 5,
      meal_log: 5,
      foot_check: 10,
      workout_log: 10,
      complication_screen_eye: 20,
      complication_screen_kidney: 20,
      complication_screen_nerve: 20,
      complication_screen_heart: 20,
      appointment_book: 50,
      referral: 100,
      streak_3day: 25,
      streak_7day: 75,
      complete_30days: 200,
    },
    reward_tiers: [
      { name: "Bronze", min_mhp: 1200, reward: "Free lab test at partner clinic | 10% off next program plan", color: "#b45309" },
      { name: "Silver", min_mhp: 3000, reward: "Free HbA1c test | 1 complimentary teleconsultation with the treating physician", color: "#6b7280" },
      { name: "Gold", min_mhp: 5000, reward: "90-day Chronic Care Plan at 50% off | Mediimate Premium badge | Priority physician access", color: "#d97706" },
    ],
    week_themes: [
      { week: 1, theme: "Foundation & Activation", goal: "Build the logging habit. Introduce rewards. Build trust." },
      { week: 2, theme: "Pattern Recognition", goal: "Fasting vs post-meal distinction. Deepen habit." },
      { week: 3, theme: "Complications Prevention", goal: "Screen for complications. Flag high-risk patients." },
      { week: 4, theme: "Conversion & Results", goal: "Get patients back to clinic. Deliver proof." },
    ],
  });
  const careplanId = careplan._id.toString();
  console.log(`Created care plan: ${careplan.name} (${careplanId})`);

  // ─── 2. Create demo patient user ───
  let demoUserId: string;
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const existingDemo = await AuthUser.findOne({ email: DEMO_EMAIL }).lean();
  if (existingDemo) {
    demoUserId = (existingDemo as any).user_id;
    // Always reset password_hash + ensure active status so login always works
    await AuthUser.updateOne(
      { email: DEMO_EMAIL },
      { $set: { password_hash: passwordHash, email_verified: true, approval_status: "active" } }
    );
    console.log(`Demo user existed — password reset: ${DEMO_EMAIL} (${demoUserId})`);
  } else {
    demoUserId = crypto.randomUUID();
    await AuthUser.create({
      email: DEMO_EMAIL,
      password_hash: passwordHash,
      user_id: demoUserId,
      email_verified: true,
      approval_status: "active",
    });
    console.log(`Created demo auth user: ${DEMO_EMAIL} (${demoUserId})`);
  }

  // Ensure role
  await UserRole.findOneAndUpdate(
    { user_id: demoUserId },
    { $set: { role: "patient" } },
    { upsert: true }
  );

  // Ensure profile
  await Profile.findOneAndUpdate(
    { user_id: demoUserId },
    { $set: { full_name: "Rahul Kumar" } },
    { upsert: true }
  );

  // Ensure patient record
  let demoPatient = await Patient.findOne({ patient_user_id: demoUserId });
  if (!demoPatient) {
    demoPatient = await Patient.create({
      patient_user_id: demoUserId,
      doctor_id: DOCTOR_ID,
      full_name: "Rahul Kumar",
      phone: "+919876500099",
      age: 42,
      gender: "male",
      conditions: ["Type 2 Diabetes", "Hypertension"],
      medications: ["Metformin 500mg", "Glimepiride 1mg"],
      status: "active",
    });
  }
  const demoPatientId = demoPatient._id.toString();
  console.log(`Demo patient: ${demoPatient.full_name} (${demoPatientId})`);

  // Ensure gamification record
  await PatientGamification.findOneAndUpdate(
    { patient_id: demoPatientId },
    {
      $setOnInsert: {
        patient_id: demoPatientId,
        current_streak: 0,
        longest_streak: 0,
        total_points: 0,
        level: 1,
        level_label: "Beginner",
      },
    },
    { upsert: true }
  );

  // ─── 3. Gather patients for assignments ───
  // Pull existing patients (up to 4 besides demo) for leaderboard diversity
  const otherPatients = await Patient.find({
    _id: { $ne: demoPatient._id },
    status: "active",
  })
    .limit(4)
    .lean();

  // If we don't have enough patients, create some
  const fakePatients = [
    { full_name: "Priya Sharma", phone: "+919876543202", age: 35, gender: "female", conditions: ["Type 2 Diabetes"] },
    { full_name: "Vikram Singh", phone: "+919876543205", age: 52, gender: "male", conditions: ["Type 2 Diabetes", "Thyroid"] },
    { full_name: "Kavita Nair", phone: "+919876543206", age: 38, gender: "female", conditions: ["Type 2 Diabetes"] },
    { full_name: "Amit Patel", phone: "+919876543203", age: 58, gender: "male", conditions: ["Type 2 Diabetes", "Hypertension"] },
  ];

  const allPatientIds: string[] = [demoPatientId];
  for (let i = 0; i < 4; i++) {
    if (i < otherPatients.length) {
      allPatientIds.push((otherPatients[i] as any)._id.toString());
    } else {
      const fp = fakePatients[i];
      const existing = await Patient.findOne({ phone: fp.phone });
      if (existing) {
        allPatientIds.push(existing._id.toString());
      } else {
        const created = await Patient.create({ ...fp, doctor_id: DOCTOR_ID, status: "active" });
        allPatientIds.push(created._id.toString());
      }
    }
  }
  console.log(`Gathered ${allPatientIds.length} patients for assignments`);

  // ─── 4. Remove old careplan assignments — by new ID and by the old plan's ID (if replaced) ───
  const idsToRemove = [careplanId];
  if (existingPlan) idsToRemove.push(existingPlan._id.toString());
  // Also nuke any stale assignments for the demo patient (from partial prior runs)
  await CarePlanAssignment.deleteMany({
    $or: [
      { careplan_id: { $in: idsToRemove } },
      { patient_id: { $in: allPatientIds } },
    ],
  });

  // ─── 5. Create assignments with realistic data ───
  const targetMHP = [1340, 210, 3210, 145, 4890]; // demo=1340(Bronze), p2=210, p3=3210(Silver), p4=145, p5=4890(Silver)
  const startDate = dateNDaysAgo(14); // program started 14 days ago

  for (let i = 0; i < allPatientIds.length; i++) {
    const patientId = allPatientIds[i];
    const target = targetMHP[i];
    const isDemo = i === 0;

    // Generate 14 days of logs
    const dayLogs = [];
    const mhpHistory: { action: string; points: number; date: Date; day: number }[] = [];
    let mhpAccumulated = 0;
    let streakDays = 0;
    let lastLogDate = "";

    for (let day = 1; day <= 14; day++) {
      const logDate = new Date(startDate);
      logDate.setDate(logDate.getDate() + day - 1);
      const dateStr = formatDate(logDate);

      const logged = isDemo ? true : Math.random() < 0.85; // demo always logs to maintain streak
      const fastingSugar = logged ? randomBetween(110, 180) : null;
      const postmealSugar = logged && day >= 8 ? randomBetween(140, 220) : null; // Week 2+ gets double readings
      const medsTaken = Math.random() < 0.80;
      const mealsLogged = logged ? randomBetween(0, 2) : 0;
      const footCheckDay = day === 3 || day === 13;
      const footCheckDone = footCheckDay && Math.random() < 0.7;
      const workoutLogged = logged && Math.random() < 0.3;

      let mhpToday = 0;

      if (fastingSugar) {
        const pts = 10;
        mhpToday += pts;
        mhpHistory.push({ action: "fasting_sugar_log", points: pts, date: logDate, day });
      }
      if (postmealSugar) {
        const pts = 10;
        mhpToday += pts;
        mhpHistory.push({ action: "postmeal_sugar_log", points: pts, date: logDate, day });
      }
      if (medsTaken) {
        const pts = 5;
        mhpToday += pts;
        mhpHistory.push({ action: "medicine_confirm", points: pts, date: logDate, day });
      }
      for (let m = 0; m < mealsLogged; m++) {
        const pts = 5;
        mhpToday += pts;
        mhpHistory.push({ action: "meal_log", points: pts, date: logDate, day });
      }
      if (footCheckDone) {
        const pts = 10;
        mhpToday += pts;
        mhpHistory.push({ action: "foot_check", points: pts, date: logDate, day });
      }
      if (workoutLogged) {
        const pts = 10;
        mhpToday += pts;
        mhpHistory.push({ action: "workout_log", points: pts, date: logDate, day });
      }

      // Streak bonuses
      if (logged) {
        streakDays++;
        lastLogDate = dateStr;
        if (streakDays === 3) {
          mhpToday += 25;
          mhpHistory.push({ action: "streak_3day", points: 25, date: logDate, day });
        }
        if (streakDays === 7) {
          mhpToday += 75;
          mhpHistory.push({ action: "streak_7day", points: 75, date: logDate, day });
        }
      } else {
        streakDays = 0;
      }

      mhpAccumulated += mhpToday;

      dayLogs.push({
        day,
        date: logDate,
        fasting_sugar: fastingSugar,
        postmeal_sugar: postmealSugar,
        meds_taken: medsTaken,
        meals_logged: mealsLogged,
        foot_check_done: footCheckDone,
        workout_logged: workoutLogged,
        mhp_earned_today: mhpToday,
        escalation_triggered: false,
        notes: "",
      });

      // For demo user, also write Vital records for blood sugar
      if (isDemo && fastingSugar) {
        const morningTime = new Date(logDate);
        morningTime.setHours(7, 30, 0, 0);
        await Vital.create({
          patient_id: patientId,
          doctor_id: DOCTOR_ID,
          vital_type: "blood_sugar",
          value_numeric: fastingSugar,
          value_text: String(fastingSugar),
          unit: "mg/dL",
          recorded_at: morningTime,
          source: "careplan",
          notes: "Fasting blood sugar",
        });
      }
      if (isDemo && postmealSugar) {
        const eveningTime = new Date(logDate);
        eveningTime.setHours(14, 30, 0, 0);
        await Vital.create({
          patient_id: patientId,
          doctor_id: DOCTOR_ID,
          vital_type: "blood_sugar",
          value_numeric: postmealSugar,
          value_text: String(postmealSugar),
          unit: "mg/dL",
          recorded_at: eveningTime,
          source: "careplan",
          notes: "Post-meal blood sugar",
        });
      }
    }

    // Adjust MHP to match target (scale the history proportionally)
    const scaleFactor = mhpAccumulated > 0 ? target / mhpAccumulated : 1;
    const adjustedHistory = mhpHistory.map((h) => ({
      ...h,
      points: Math.round(h.points * scaleFactor),
    }));

    // Determine tier
    let tier: string | null = null;
    if (target >= 5000) tier = "Gold";
    else if (target >= 3000) tier = "Silver";
    else if (target >= 1200) tier = "Bronze";

    const assignment = await CarePlanAssignment.create({
      careplan_id: careplanId,
      patient_id: patientId,
      doctor_id: DOCTOR_ID,
      clinic_id: null,
      status: "active",
      enrolled_at: startDate,
      start_date: startDate,
      current_day: 14,
      onboarding_complete: true,
      onboarding_step: 3,
      diabetes_type: "tablets",
      medicines: ["Metformin 500mg", "Glimepiride 1mg"],
      baseline_sugar: randomBetween(150, 190),
      baseline_timing: "fasting",
      complications: [],
      mhp_balance: target,
      mhp_tier: tier,
      mhp_history: adjustedHistory,
      streak_days: streakDays,
      last_log_date: lastLogDate,
      day_logs: dayLogs,
      complications_screened: { eye: false, kidney: false, nerve: false, heart: false },
      appointment_booked: false,
      escalations_count: 0,
      escalation_log: [],
      rewards_claimed: { bronze: false, silver: false, gold: false },
    });

    const pat = await Patient.findById(patientId).select("full_name").lean();
    console.log(
      `Created assignment for ${(pat as any)?.full_name || patientId}: ${target} MHP (${tier || "No tier"})`
    );
  }

  // ─── 6. Create a welcome notification for demo user ───
  await Notification.create({
    user_id: demoUserId,
    title: "Welcome to your Care Plan!",
    message: "You have been enrolled in the 30-Day Diabetes Chronic Care Program. Start logging today!",
    category: "careplan",
    type: "success",
    is_read: false,
    related_type: "careplan_assignment",
  });

  console.log("\n✅ Seed complete!");
  console.log(`   Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`   Care plan: ${careplan.name}`);
  console.log(`   ${allPatientIds.length} assignments created`);

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
