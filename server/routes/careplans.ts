/**
 * Care Plan API routes.
 * Handles patient care plan tracker, task logging, complication screening,
 * leaderboard, report, and doctor enrollment.
 */
import { Router, Request } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.js";
import {
  CarePlan,
  CarePlanAssignment,
  Patient,
  PatientDoctorLink,
  PatientGamification,
  Vital,
  FoodLog,
  MedicationLog,
  Notification,
  Alert,
  Profile,
  UserRole,
} from "../models/index.js";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string }); // strictly pass object

type AuthRequest = Request & { user: { id: string } };

// ─── Helper: resolve patient for current user (same logic as main routes) ───
async function getPatientForCurrentUser(req: Request): Promise<{ patient_id: string; doctor_id: string; patient_ids: string[] } | null> {
  const userId = (req as AuthRequest).user.id;
  const patients = await Patient.find({ patient_user_id: userId }).select("_id doctor_id").sort({ createdAt: 1 }).lean();
  if (patients.length === 0) {
    const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
    if ((roleDoc as { role?: string })?.role === "patient") {
      const profile = await Profile.findOne({ user_id: userId }).select("full_name").lean();
      const created = await Patient.create({
        patient_user_id: userId,
        doctor_id: userId,
        full_name: (profile as { full_name?: string })?.full_name || "Patient",
        phone: " ",
        status: "active",
      });
      const id = created._id.toString();
      return { patient_id: id, doctor_id: (created as any).doctor_id, patient_ids: [id] };
    }
    return null;
  }
  const patient_ids = (patients as { _id: unknown }[]).map((p) => p._id?.toString()).filter(Boolean) as string[];
  const activeLink = await PatientDoctorLink.findOne({ patient_user_id: userId, status: "active" })
    .select("doctor_user_id").sort({ responded_at: -1, createdAt: -1 }).lean();
  if (activeLink) {
    const docId = (activeLink as { doctor_user_id: string }).doctor_user_id;
    const linkedPatient = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id === docId);
    if (linkedPatient) return { patient_id: linkedPatient._id?.toString() as string, doctor_id: docId, patient_ids };
  }
  const underDoctor = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id && p.doctor_id !== userId);
  if (underDoctor) return { patient_id: underDoctor._id?.toString() as string, doctor_id: underDoctor.doctor_id, patient_ids };
  const first = patients[0] as { _id: unknown; doctor_id: string };
  return { patient_id: first._id?.toString() as string, doctor_id: first.doctor_id, patient_ids };
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── GET /me/enrollments — Patient's care plan enrollments (for My Programs page) ───
router.get("/me/enrollments", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.json([]);

  const assignments = await CarePlanAssignment.find({
    patient_id: { $in: link.patient_ids },
  }).lean();

  const enrollments = await Promise.all(
    (assignments as any[]).map(async (a) => {
      const careplan = await CarePlan.findById(a.careplan_id).lean();
      const daysLogged = (a.day_logs || []).filter(
        (d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken
      ).length;
      const adherence = a.current_day > 0
        ? Math.round((daysLogged / a.current_day) * 100)
        : 0;
      return {
        id: a._id?.toString(),
        program_id: a.careplan_id,
        program_name: (careplan as any)?.name || "Care Program",
        condition: (careplan as any)?.condition,
        duration_days: (careplan as any)?.duration_days,
        status: a.status,
        adherence_percentage: adherence,
        enrolled_at: a.enrolled_at,
        completed_at: a.completed_at,
        current_day: a.current_day,
        mhp_balance: a.mhp_balance,
        mhp_tier: a.mhp_tier,
      };
    })
  );

  return res.json(enrollments);
});

// ─── GET /me/careplan — Patient's active care plan ───
router.get("/me/careplan", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  // Support ?assignmentId=xxx to load a specific enrolment (multi-plan)
  const { assignmentId } = req.query as { assignmentId?: string };

  let assignment;
  if (assignmentId) {
    assignment = await CarePlanAssignment.findOne({
      _id: assignmentId,
      patient_id: { $in: link.patient_ids },
      status: "active",
    }).lean();
  } else {
    // Find active assignment for any of this user's patient ids
    const filter = link.patient_ids.length > 1
      ? { patient_id: { $in: link.patient_ids }, status: "active" }
      : { patient_id: link.patient_id, status: "active" };
    assignment = await CarePlanAssignment.findOne(filter).lean();
  }
  if (!assignment) return res.json({ assignment: null, careplan: null });

  const a = assignment as any;
  const careplan = await CarePlan.findById(a.careplan_id).lean();
  if (!careplan) return res.json({ assignment: null, careplan: null });

  // Calculate current_day based on start_date
  const start = new Date(a.start_date);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const currentDay = Math.min(Math.max(Math.ceil(diffMs / 86400000), 1), (careplan as any).duration_days);

  // Update current_day if changed
  if (currentDay !== a.current_day) {
    await CarePlanAssignment.updateOne({ _id: a._id }, { $set: { current_day: currentDay } });
    a.current_day = currentDay;
  }

  // Cross-check today's vitals and food_logs for auto-completion
  const dayStart = startOfToday();
  const dayEnd = endOfToday();

  // Fetch the exact patient document for daily_med_status checking
  const exactPatient = await Patient.findById(a.patient_id).lean();

  const [todayVitals, todayFoodLogs] = await Promise.all([
    Vital.find({
      patient_id: link.patient_id,
      vital_type: "blood_sugar",
      recorded_at: { $gte: dayStart, $lte: dayEnd },
    }).lean(),
    FoodLog.find({
      patient_id: link.patient_id,
      logged_at: { $gte: dayStart, $lte: dayEnd },
    }).lean(),
  ]);

  // Determine today's already-completed tasks
  const todayLog = (a.day_logs || []).find((dl: any) => dl.day === currentDay);
  const todayTasks = {
    fasting_sugar_logged: !!(todayLog?.fasting_sugar) || todayVitals.some((v: any) => {
      const notes = (v.notes || "").toLowerCase();
      const hour = new Date(v.recorded_at).getHours();
      return notes.includes("fasting") || hour < 10;
    }),
    postmeal_sugar_logged: !!(todayLog?.postmeal_sugar) || todayVitals.some((v: any) => {
      const notes = (v.notes || "").toLowerCase();
      const hour = new Date(v.recorded_at).getHours();
      return notes.includes("post") || notes.includes("after") || hour >= 12;
    }),
    medicine_confirmed: (() => {
      const dms = (exactPatient as any)?.daily_med_status;
      if (!dms || !dms.statuses || dms.statuses.length === 0) return false;
      return dms.statuses.every((s: any) => s.status === "taken");
    })(),
    meal_logged: (todayLog?.meals_logged || 0) > 0 || todayFoodLogs.length > 0,
    foot_check_done: !!(todayLog?.foot_check_done),
    workout_logged: !!(todayLog?.workout_logged),
  };

  // Determine week
  const currentWeek = Math.min(Math.ceil(currentDay / 7), 4);
  const weekTheme = ((careplan as any).week_themes || []).find((w: any) => w.week === currentWeek);

  return res.json({
    assignment: { ...a, id: a._id?.toString(), _id: undefined, __v: undefined, current_day: currentDay },
    careplan: { ...(careplan as any), id: (careplan as any)._id?.toString(), _id: undefined, __v: undefined },
    today_tasks: todayTasks,
    current_week: currentWeek,
    week_theme: weekTheme,
    medications_status: (exactPatient as any)?.daily_med_status?.statuses || [],
  });
});

// ─── POST /me/careplan/:assignmentId/voice-log — Multimodal Voice Transcription ───
router.post("/me/careplan/:assignmentId/voice-log", requireAuth, upload.single("audio"), async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: "Audio file is required" });
  }

  const exactPatient = await Patient.findById(link.patient_id).lean();
  const activeMeds = ((exactPatient as any)?.daily_med_status?.statuses || []).map((s: any) => s.medicine);

  const prompt = `You are a clinical AI assisting a patient. They have submitted a voice log describing their health activities.
Extract their activities into a strict JSON array of intent objects matching this exact schema:
[
  { "action": "meal_log", "notes": "what they ate" },
  { "action": "fasting_sugar_log", "value": <number> },
  { "action": "postmeal_sugar_log", "value": <number> },
  { "action": "medicine_confirm", "medsList": ["Medicine A", "Medicine B"] },
  { "action": "workout_log", "notes": "what they did" },
  { "action": "foot_check", "notes": "any foot issues mentioned" }
]
Rules:
- If they mention taking medicines, check against their active medications: ${JSON.stringify(activeMeds)}. If they say "I took all my medicines" or similar, include ALL of them in medsList.
- For sugar logs, guess fasting vs postmeal contextually (e.g., morning/empty stomach = fasting).
- ONLY output a raw JSON array. Do not wrap in markdown \`\`\`json.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: req.file.mimetype, data: req.file.buffer.toString("base64") } },
          ]
        }
      ]
    });

    const output = response.text || "[]";
    const cleaned = output.replace(/```json/g, "").replace(/```/g, "").trim();
    const intents = JSON.parse(cleaned);

    return res.json({ intents });
  } catch (error: any) {
    console.error("Gemini Voice Parsing Error:", error.message || error);
    return res.status(500).json({ error: "Failed to transcribe audio or parse intents. Please try again." });
  }
});

// ─── POST /me/careplan/:assignmentId/log-action — Log a task ───
router.post("/me/careplan/:assignmentId/log-action", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const { assignmentId } = req.params;
  const assignment = await CarePlanAssignment.findById(assignmentId);
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const a = assignment as any;

  // Verify ownership
  if (!link.patient_ids.includes(a.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { action, value, timing, notes, medsList } = req.body;
  if (!action) return res.status(400).json({ error: "action required" });

  const validActions = [
    "fasting_sugar_log", "postmeal_sugar_log", "medicine_confirm",
    "meal_log", "foot_check", "workout_log",
  ];
  if (!validActions.includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  // Get careplan for scoring rules
  const careplan = await CarePlan.findById(a.careplan_id).lean();
  if (!careplan) return res.status(404).json({ error: "Care plan not found" });

  const scoringRules = (careplan as any).scoring_rules || {};
  const points = scoringRules[action] || 0;

  // Calculate current day
  const start = new Date(a.start_date);
  const now = new Date();
  const currentDay = Math.min(Math.max(Math.ceil((now.getTime() - start.getTime()) / 86400000), 1), (careplan as any).duration_days);

  // Find or create today's day_log entry
  let todayLog = a.day_logs.find((dl: any) => dl.day === currentDay);
  if (!todayLog) {
    todayLog = {
      day: currentDay,
      date: now,
      fasting_sugar: null,
      postmeal_sugar: null,
      meds_taken: false,
      meds_taken_list: [],
      meals_logged: 0,
      foot_check_done: false,
      workout_logged: false,
      mhp_earned_today: 0,
      escalation_triggered: false,
      notes: "",
    };
    a.day_logs.push(todayLog);
  }

  let pointsToAward = points;
  let subActionsCompleted: string[] = [];
  const numericVal = value != null && Number.isFinite(Number(value)) ? Number(value) : null;

  // Determine if action is fully completed and configure points
  if (action === "fasting_sugar_log") {
    if (todayLog.fasting_sugar != null) return res.status(409).json({ error: "Fasting sugar already logged today" });
    todayLog.fasting_sugar = numericVal;
  } else if (action === "postmeal_sugar_log") {
    if (todayLog.postmeal_sugar != null) return res.status(409).json({ error: "Post-meal sugar already logged today" });
    todayLog.postmeal_sugar = numericVal;
  } else if (action === "foot_check") {
    if (todayLog.foot_check_done) return res.status(409).json({ error: "Foot check already done" });
    todayLog.foot_check_done = true;
  } else if (action === "workout_log") {
    if (todayLog.workout_logged) return res.status(409).json({ error: "Workout already logged" });
    todayLog.workout_logged = true;
  } else if (action === "meal_log") {
    todayLog.meals_logged = (todayLog.meals_logged || 0) + 1;
  } else if (action === "medicine_confirm") {
    const patientDoc = await Patient.findById(a.patient_id);
    if (!patientDoc) return res.status(404).json({ error: "Patient not found" });

    const dms = (patientDoc as any).daily_med_status;
    let anyUpdates = false;

    if (dms && dms.statuses && Array.isArray(medsList)) {
      for (const medName of medsList) {
        const medEntry = dms.statuses.find((s: any) => s.medicine === medName);
        if (medEntry && medEntry.status !== "taken") {
          medEntry.status = "taken";
          subActionsCompleted.push(medName);
          anyUpdates = true;
        }
      }
    }

    if (!anyUpdates) {
      return res.status(409).json({ error: "Selected medications already taken or invalid" });
    }

    // Save changes to patient's daily_med_status natively
    await patientDoc.save();

    // Check if ALL are taken
    const allTaken = dms.statuses.length > 0 && dms.statuses.every((s: any) => s.status === "taken");
    
    if (allTaken) {
       todayLog.meds_taken = true;
       pointsToAward = points; // Award full points only when ALL are taken!
    } else {
       pointsToAward = 0; // Partial completion does not yield fractional points
    }
  }

  todayLog.mhp_earned_today = (todayLog.mhp_earned_today || 0) + pointsToAward;

  // Add to mhp_history
  a.mhp_history.push({ action, points: pointsToAward, date: now, day: currentDay, notes: subActionsCompleted.length > 0 ? subActionsCompleted.join(", ") : notes });
  a.mhp_balance = (a.mhp_balance || 0) + pointsToAward;

  // Update streak
  const td = todayStr();
  const yd = yesterdayStr();
  if (a.last_log_date === td) {
    // Already logged today, streak unchanged
  } else if (a.last_log_date === yd) {
    a.streak_days = (a.streak_days || 0) + 1;
  } else if (!a.last_log_date) {
    a.streak_days = 1;
  } else {
    a.streak_days = 1; // Reset streak
  }
  a.last_log_date = td;
  a.current_day = currentDay;

  // Check streak milestones
  let bonusPoints = 0;
  if (a.streak_days === 3) {
    bonusPoints += scoringRules.streak_3day || 25;
    a.mhp_history.push({ action: "streak_3day", points: scoringRules.streak_3day || 25, date: now, day: currentDay });
  }
  if (a.streak_days === 7) {
    bonusPoints += scoringRules.streak_7day || 75;
    a.mhp_history.push({ action: "streak_7day", points: scoringRules.streak_7day || 75, date: now, day: currentDay });
  }
  a.mhp_balance += bonusPoints;

  // Check tier thresholds
  const tiers = (careplan as any).reward_tiers || [];
  const sortedTiers = [...tiers].sort((x, y) => (y.min_mhp || 0) - (x.min_mhp || 0));
  const oldTier = a.mhp_tier;
  let newTier = "";
  for (const tier of sortedTiers) {
    if (a.mhp_balance >= (tier.min_mhp || 0)) {
      newTier = tier.name;
      break;
    }
  }
  a.mhp_tier = newTier || null;

  // Notify on new tier
  if (a.mhp_tier && a.mhp_tier !== oldTier) {
    // Resolve user_id from patient
    const patient = await Patient.findById(a.patient_id).select("patient_user_id").lean();
    const patientUserId = (patient as any)?.patient_user_id;
    if (patientUserId) {
      await Notification.create({
        user_id: patientUserId,
        title: `${a.mhp_tier} Tier Unlocked!`,
        message: `Congratulations! You've reached ${a.mhp_tier} tier with ${a.mhp_balance} MHP. Check your rewards!`,
        category: "careplan",
        type: "success",
        is_read: false,
        related_type: "careplan_assignment",
        related_id: a._id.toString(),
      });
    }
  }

  if ((action === "fasting_sugar_log" || action === "postmeal_sugar_log") && numericVal != null) {
    await Vital.create({
      patient_id: a.patient_id,
      doctor_id: a.doctor_id,
      vital_type: "blood_sugar",
      value_numeric: numericVal,
      value_text: String(numericVal),
      unit: "mg/dL",
      recorded_at: now,
      source: "careplan",
      notes: action === "fasting_sugar_log" ? "Fasting blood sugar" : "Post-meal blood sugar",
    });
  } else if (action === "meal_log" && notes) {
    await FoodLog.create({
      patient_id: a.patient_id,
      doctor_id: a.doctor_id,
      notes,
      meal_type: "other",
      logged_at: now,
      source: "careplan",
    });
  } else if (action === "medicine_confirm" && Array.isArray(medsList)) {
    for (const med of subActionsCompleted) {
      await MedicationLog.create({
        patient_id: a.patient_id,
        doctor_id: a.doctor_id,
        taken: true,
        medication_name: med,
        logged_at: now,
        source: "careplan",
      });
    }
  }

  // Update PatientGamification
  await PatientGamification.findOneAndUpdate(
    { patient_id: a.patient_id },
    {
      $inc: { total_points: points + bonusPoints, sugar_logs: (action.includes("sugar") ? 1 : 0), medication_logs: (action === "medicine_confirm" ? 1 : 0), food_logs: (action === "meal_log" ? 1 : 0), total_logs: 1 },
      $set: { last_log_date: td, current_streak: a.streak_days },
      $max: { longest_streak: a.streak_days },
    },
    { upsert: true }
  );

  // Save the assignment using Mongoose save
  assignment.markModified("day_logs");
  assignment.markModified("mhp_history");
  await assignment.save();

  // Re-fetch the clean doc
  const updated = await CarePlanAssignment.findById(assignmentId).lean();

  return res.json({
    assignment: { ...(updated as any), id: (updated as any)?._id?.toString(), _id: undefined, __v: undefined },
    points_awarded: points + bonusPoints,
    new_tier: a.mhp_tier !== oldTier ? a.mhp_tier : null,
  });
});

// ─── POST /me/careplan/:assignmentId/claim ───
router.post("/me/careplan/:assignmentId/claim", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const { assignmentId } = req.params;
  const assignment = await CarePlanAssignment.findById(assignmentId);
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const a = assignment as any;

  // Verify ownership
  if (!link.patient_ids.includes(a.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { tier } = req.body;
  if (!tier || !["bronze", "silver", "gold"].includes(tier.toLowerCase())) {
    return res.status(400).json({ error: "Valid tier required: bronze, silver, gold" });
  }

  const tierKey = tier.toLowerCase();
  if (tierKey === "gold") {
    return res.status(400).json({ error: "Gold tier is disabled for the pilot" });
  }

  const careplan = await CarePlan.findById(a.careplan_id).lean();
  if (!careplan) return res.status(404).json({ error: "Care plan not found" });

  const tierDef = (careplan as any).reward_tiers?.find(
    (t: any) => t.name.toLowerCase() === tierKey
  );
  if (!tierDef) {
    return res.status(404).json({ error: `Tier ${tier} not defined in care plan` });
  }

  const minMhp = tierDef.min_mhp || 0;
  if (a.mhp_balance < minMhp) {
    return res.status(400).json({ error: "Insufficient points to claim this tier" });
  }

  if (a.rewards_claimed?.[tierKey]) {
    return res.status(400).json({ error: "Tier already claimed" });
  }

  // Generate Coupon Code
  const prefix = tierKey === "bronze" ? "BRONZE-LAB-" : "SILVER-HBA1C-";
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const couponCode = `${prefix}${randomStr}`;

  // Initialize rewards_claimed and reward_coupons if not present
  if (!a.rewards_claimed) a.rewards_claimed = {};
  if (!a.reward_coupons) a.reward_coupons = {};

  a.rewards_claimed[tierKey] = true;
  a.reward_coupons[tierKey] = couponCode;

  // Log in history
  const now = new Date();
  const currentDay = a.current_day || 1;
  a.mhp_history.push({
    action: `claim_reward_${tierKey}`,
    points: 0,
    date: now,
    day: currentDay,
  });

  assignment.markModified("rewards_claimed");
  assignment.markModified("reward_coupons");
  assignment.markModified("mhp_history");
  await assignment.save();

  return res.json({
    success: true,
    coupon_code: couponCode,
    rewards_claimed: a.rewards_claimed,
    reward_coupons: a.reward_coupons,
  });
});

// ─── POST /me/careplan/:assignmentId/screen-complication ───
router.post("/me/careplan/:assignmentId/screen-complication", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const { assignmentId } = req.params;
  const assignment = await CarePlanAssignment.findById(assignmentId);
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const a = assignment as any;

  if (!link.patient_ids.includes(a.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { type, response: screenResponse, concerning } = req.body;
  const validTypes = ["eye", "kidney", "nerve", "heart"];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: "Valid type required: eye, kidney, nerve, heart" });
  }

  // Check if already screened
  if (a.complications_screened?.[type]) {
    return res.status(409).json({ error: `${type} already screened` });
  }

  // Get careplan for points
  const careplan = await CarePlan.findById(a.careplan_id).lean();
  const scoringRules = (careplan as any)?.scoring_rules || {};
  const points = scoringRules[`complication_screen_${type}`] || 20;

  // Update complication screening
  const updateSet: Record<string, any> = {
    [`complications_screened.${type}`]: true,
  };

  // Award MHP
  const now = new Date();
  const td = todayStr();
  const currentDay = a.current_day || 1;
  const newBalance = (a.mhp_balance || 0) + points;

  // Check tier change
  const tiers = (careplan as any)?.reward_tiers || [];
  const sortedTiers = [...tiers].sort((x, y) => (y.min_mhp || 0) - (x.min_mhp || 0));
  let newTier = a.mhp_tier;
  for (const tier of sortedTiers) {
    if (newBalance >= (tier.min_mhp || 0)) {
      newTier = tier.name;
      break;
    }
  }

  updateSet.mhp_balance = newBalance;
  updateSet.mhp_tier = newTier;

  // Update streak
  const yd = yesterdayStr();
  let newStreak = a.streak_days || 0;
  if (a.last_log_date === td) { /* no change */ }
  else if (a.last_log_date === yd) newStreak += 1;
  else if (!a.last_log_date) newStreak = 1;
  else newStreak = 1;
  updateSet.streak_days = newStreak;
  updateSet.last_log_date = td;

  await CarePlanAssignment.findByIdAndUpdate(assignmentId, {
    $set: updateSet,
    $push: {
      mhp_history: { action: `complication_screen_${type}`, points, date: now, day: currentDay },
    },
  });

  // Tier notification
  if (newTier && newTier !== a.mhp_tier) {
    const patient = await Patient.findById(a.patient_id).select("patient_user_id").lean();
    const patientUserId = (patient as any)?.patient_user_id;
    if (patientUserId) {
      await Notification.create({
        user_id: patientUserId,
        title: `${newTier} Tier Unlocked!`,
        message: `Congratulations! You've reached ${newTier} tier with ${newBalance} MHP.`,
        category: "careplan",
        type: "success",
        is_read: false,
        related_type: "careplan_assignment",
        related_id: assignmentId,
      });
    }
  }

  // If concerning: create alert
  if (concerning) {
    await Alert.create({
      alert_type: "complication_flag",
      severity: "warning",
      status: "open",
      title: `Complication flag: ${type}`,
      description: `Patient reported concerning ${type} screening response: ${JSON.stringify(screenResponse)}`,
      patient_id: a.patient_id,
      doctor_id: a.doctor_id,
    });
  }

  // Update PatientGamification
  await PatientGamification.findOneAndUpdate(
    { patient_id: a.patient_id },
    {
      $inc: { total_points: points, total_logs: 1 },
      $set: { last_log_date: td, current_streak: newStreak },
      $max: { longest_streak: newStreak },
    },
    { upsert: true }
  );

  const updated = await CarePlanAssignment.findById(assignmentId).lean();
  return res.json({
    assignment: { ...(updated as any), id: (updated as any)?._id?.toString(), _id: undefined, __v: undefined },
    points_awarded: points,
  });
});

// ─── GET /me/careplan/:assignmentId/leaderboard ───
router.get("/me/careplan/:assignmentId/leaderboard", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const { assignmentId } = req.params;
  const assignment = await CarePlanAssignment.findById(assignmentId).lean();
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const a = assignment as any;

  // Get all assignments for same careplan
  const allAssignments = await CarePlanAssignment.find({ careplan_id: a.careplan_id })
    .sort({ mhp_balance: -1 })
    .lean();

  const td = todayStr();

  // Collect patient names for anonymization
  const patientIds = allAssignments.map((asg: any) => asg.patient_id);
  const patients = await Patient.find({ _id: { $in: patientIds } }).select("_id full_name").lean();
  const nameMap = new Map(patients.map((p: any) => [p._id.toString(), p.full_name || "Patient"]));

  // Get current user's patient_id for highlighting
  const currentPatientId = link.patient_id;

  // Build ranked list
  const ranked = allAssignments.map((asg: any, idx: number) => {
    const fullName = nameMap.get(asg.patient_id) || "Patient";
    const parts = fullName.trim().split(/\s+/);
    const anonymized = parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1][0]}.`
      : parts[0];

    const isCurrentUser = link.patient_ids.includes(asg.patient_id);

    // Determine badge
    let badge: string | null = null;
    if (idx === 0) badge = "Top Performer";
    else if ((asg.streak_days || 0) >= 5) badge = "On a Roll";
    else if (asg.last_log_date && asg.last_log_date !== td) {
      const lastDate = new Date(asg.last_log_date);
      const diff = Math.floor((new Date().getTime() - lastDate.getTime()) / 86400000);
      if (diff >= 2 && asg.last_log_date === td) badge = "Comeback";
    }

    return {
      rank: idx + 1,
      patient_id: asg.patient_id,
      name: isCurrentUser ? fullName : anonymized,
      mhp_balance: asg.mhp_balance || 0,
      mhp_tier: asg.mhp_tier,
      streak_days: asg.streak_days || 0,
      is_current_user: isCurrentUser,
      badge,
    };
  });

  // Batch momentum: how many logged today
  const loggedToday = allAssignments.filter((asg: any) => asg.last_log_date === td).length;
  const totalMembers = allAssignments.length;

  // Recent activity feed: last 10 mhp_history events across all assignments
  const allHistory: { action: string; points: number; date: Date; day: number; patient_name: string }[] = [];
  for (const asg of allAssignments as any[]) {
    const fullName = nameMap.get(asg.patient_id) || "Patient";
    const parts = fullName.trim().split(/\s+/);
    const anonymized = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    for (const h of (asg.mhp_history || []).slice(-5)) {
      allHistory.push({ ...h, patient_name: anonymized });
    }
  }
  allHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const activityFeed = allHistory.slice(0, 10);

  // Compute weekly top 3 (current week)
  const mondayOfThisWeek = new Date();
  const dayOfWeek = mondayOfThisWeek.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  mondayOfThisWeek.setDate(mondayOfThisWeek.getDate() - diff);
  mondayOfThisWeek.setHours(0, 0, 0, 0);

  const weeklyScores = allAssignments.map((asg: any) => {
    const weeklyMhp = (asg.mhp_history || [])
      .filter((h: any) => new Date(h.date) >= mondayOfThisWeek)
      .reduce((sum: number, h: any) => sum + (h.points || 0), 0);
    const fullName = nameMap.get(asg.patient_id) || "Patient";
    const parts = fullName.trim().split(/\s+/);
    const anonymized = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    const isCurrentUser = link.patient_ids.includes(asg.patient_id);
    return {
      patient_id: asg.patient_id,
      name: isCurrentUser ? fullName : anonymized,
      weekly_mhp: weeklyMhp,
      is_current_user: isCurrentUser,
    };
  });
  weeklyScores.sort((a: any, b: any) => b.weekly_mhp - a.weekly_mhp);

  // Current user's position
  const myRank = ranked.find((r) => r.is_current_user);
  const nextAbove = myRank && myRank.rank > 1 ? ranked[myRank.rank - 2] : null;

  // Get careplan for context
  const careplan = await CarePlan.findById(a.careplan_id).select("name duration_days").lean();

  return res.json({
    careplan_name: (careplan as any)?.name || "Care Plan",
    duration_days: (careplan as any)?.duration_days || 30,
    current_day: a.current_day || 1,
    total_members: totalMembers,
    logged_today: loggedToday,
    momentum_pct: totalMembers > 0 ? Math.round((loggedToday / totalMembers) * 100) : 0,
    rankings: ranked,
    weekly_top: weeklyScores.slice(0, 3),
    activity_feed: activityFeed,
    my_rank: myRank?.rank || 0,
    my_mhp: myRank?.mhp_balance || 0,
    next_above: nextAbove ? { name: nextAbove.name, mhp: nextAbove.mhp_balance, gap: (nextAbove.mhp_balance - (myRank?.mhp_balance || 0)) } : null,
  });
});

// ─── GET /me/careplan/:assignmentId/report ───
router.get("/me/careplan/:assignmentId/report", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const { assignmentId } = req.params;
  const assignment = await CarePlanAssignment.findById(assignmentId).lean();
  if (!assignment) return res.status(404).json({ error: "Assignment not found" });
  const a = assignment as any;

  if (!link.patient_ids.includes(a.patient_id)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const dayLogs = a.day_logs || [];

  // Pull blood sugar vitals from program date range
  const startDate = new Date(a.start_date);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);

  const vitals = await Vital.find({
    patient_id: a.patient_id,
    vital_type: "blood_sugar",
    recorded_at: { $gte: startDate, $lte: endDate },
  }).sort({ recorded_at: 1 }).lean();

  // Calculate averages
  const fastingReadings = dayLogs.filter((d: any) => d.fasting_sugar != null).map((d: any) => d.fasting_sugar);
  const postmealReadings = dayLogs.filter((d: any) => d.postmeal_sugar != null).map((d: any) => d.postmeal_sugar);
  const allReadings = [...fastingReadings, ...postmealReadings];

  const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const avgFasting = avg(fastingReadings);
  const avgPostmeal = avg(postmealReadings);
  const avgGlucose = avg(allReadings);
  const estimatedHba1c = allReadings.length > 0 ? parseFloat(((avgGlucose + 46.7) / 28.7).toFixed(1)) : 0;

  const daysLogged = dayLogs.filter((d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken).length;
  const medsDays = dayLogs.filter((d: any) => d.meds_taken).length;
  const totalDays = dayLogs.length || 1;
  const medicationAdherencePct = Math.round((medsDays / totalDays) * 100);

  // Complications screened
  const screened = a.complications_screened || {};
  const complicationsScreened = Object.entries(screened)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return res.json({
    avg_fasting: avgFasting,
    avg_postmeal: avgPostmeal,
    avg_glucose: avgGlucose,
    estimated_hba1c: estimatedHba1c,
    medication_adherence_pct: medicationAdherencePct,
    days_logged: daysLogged,
    total_days: dayLogs.length,
    escalations_count: a.escalations_count || 0,
    complications_screened: complicationsScreened,
    mhp_balance: a.mhp_balance || 0,
    mhp_tier: a.mhp_tier,
    streak_days: a.streak_days || 0,
    vitals: vitals.map((v: any) => ({ ...v, id: v._id?.toString(), _id: undefined, __v: undefined })),
    day_logs: dayLogs,
  });
});

// ─── POST /care-plans/enroll — Doctor enrolls a patient ───
router.post("/care-plans/enroll", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  if ((roleDoc as { role?: string })?.role !== "doctor") {
    return res.status(403).json({ error: "Only doctors can enroll patients" });
  }

  const { patient_id, careplan_id, clinic_id } = req.body;
  if (!patient_id || !careplan_id) {
    return res.status(400).json({ error: "patient_id and careplan_id required" });
  }

  const careplan = await CarePlan.findById(careplan_id).lean();
  if (!careplan || !(careplan as any).is_active) {
    return res.status(404).json({ error: "Care plan not found or inactive" });
  }

  // Check no active assignment exists
  const existing = await CarePlanAssignment.findOne({ patient_id, careplan_id, status: "active" }).lean();
  if (existing) {
    return res.status(409).json({ error: "Patient already enrolled in this care plan" });
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const assignment = await CarePlanAssignment.create({
    careplan_id,
    patient_id,
    doctor_id: userId,
    clinic_id: clinic_id || null,
    status: "active",
    start_date: tomorrow,
    current_day: 0,
  });

  // Send notification to patient
  const patient = await Patient.findById(patient_id).select("patient_user_id full_name").lean();
  if ((patient as any)?.patient_user_id) {
    await Notification.create({
      user_id: (patient as any).patient_user_id,
      title: "You have been enrolled in a care plan!",
      message: `Your doctor has enrolled you in ${(careplan as any).name}. It starts tomorrow!`,
      category: "careplan",
      type: "success",
      is_read: false,
      related_type: "careplan_assignment",
      related_id: assignment._id.toString(),
    });
  }

  return res.status(201).json({
    assignment: { ...assignment.toObject(), id: assignment._id.toString(), _id: undefined, __v: undefined },
  });
});

// ═══════════════════════════════════════════════════════════
//  DOCTOR-FACING CARE PLAN MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════

// ─── GET /care-plans — List all care plans with enrolled counts ───
router.get("/care-plans", requireAuth, async (_req, res) => {
  const plans = await CarePlan.find({ is_active: true }).sort({ created_at: -1 }).lean();

  const result = await Promise.all(
    (plans as any[]).map(async (p) => {
      const enrolled = await CarePlanAssignment.countDocuments({
        careplan_id: p._id.toString(),
        status: "active",
      });
      const assignments = await CarePlanAssignment.find({
        careplan_id: p._id.toString(),
        status: "active",
      })
        .select("mhp_balance day_logs current_day")
        .lean();

      const adherenceList = (assignments as any[]).map((a) => {
        const daysLogged = (a.day_logs || []).filter(
          (d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken
        ).length;
        return a.current_day > 0 ? (daysLogged / a.current_day) * 100 : 0;
      });
      const avgAdherence =
        adherenceList.length > 0
          ? Math.round(adherenceList.reduce((a, b) => a + b, 0) / adherenceList.length)
          : 0;

      return {
        ...p,
        id: p._id?.toString(),
        _id: undefined,
        __v: undefined,
        enrolled_count: enrolled,
        avg_adherence: avgAdherence,
      };
    })
  );

  return res.json(result);
});

// ─── POST /care-plans/ai-generate — Generate a care plan draft with AI logic ───
router.post("/care-plans/ai-generate", requireAuth, async (req, res) => {
  const { condition, duration_days, goals, tracking_items } = req.body;
  if (!condition) return res.status(400).json({ error: "condition required" });

  const dur = Number(duration_days) || 30;
  const condLow = String(condition).toLowerCase();
  const items: string[] = Array.isArray(tracking_items) ? tracking_items : [];

  const isDiabetes = /diabet|sugar|glucose|hba1c|insulin/.test(condLow);
  const isHypertension = /hypertens|blood pressure|\bbp\b/.test(condLow);
  const isObesity = /obes|weight|bmi/.test(condLow);
  const isCholesterol = /cholesterol|lipid/.test(condLow);
  const isThyroid = /thyroid/.test(condLow);
  const isAsthma = /asthma|respiratory|lung/.test(condLow);
  const isPcos = /pcos|pcod/.test(condLow);

  // ─ Scoring rules ─
  const scoring: Record<string, number> = {
    medicine_confirm: 5,
    meal_log: 5,
    workout_log: 10,
    streak_3day: 25,
    streak_7day: 75,
    complete_30days: 200,
    appointment_book: 50,
    referral: 100,
    complication_screen_eye: 20,
    complication_screen_kidney: 20,
    complication_screen_nerve: 20,
    complication_screen_heart: 20,
  };

  if (isDiabetes || items.includes("blood_sugar")) {
    scoring.fasting_sugar_log = 10;
    scoring.postmeal_sugar_log = 10;
    scoring.foot_check = 10;
  }
  if (isHypertension || items.includes("blood_pressure")) {
    scoring.bp_log = 10;
  }
  if (isObesity || items.includes("weight")) {
    scoring.weight_log = 5;
  }

  // ─ Week themes ─
  const weeks = Math.min(Math.ceil(dur / 7), 12);
  const weekThemes = [];

  if (isDiabetes) {
    const diabetesThemes = [
      { week: 1, theme: "Foundation & Activation", goal: "Build the daily logging habit. Medication reminders. Trust building." },
      { week: 2, theme: "Pattern Recognition", goal: "Fasting vs post-meal distinction. Identify personal sugar triggers." },
      { week: 3, theme: "Complications Prevention", goal: "Screen for eye, kidney, nerve, and heart complications." },
      { week: 4, theme: "Conversion & Results", goal: "Review progress. Book clinic visit. Convert to long-term plan." },
      { week: 5, theme: "Lifestyle Optimisation", goal: "India-specific diet tips. Exercise integration. Sleep quality." },
      { week: 6, theme: "Family Involvement", goal: "Caregiver update. Family-shared goals. Social support." },
      { week: 7, theme: "Mental Wellness", goal: "Stress impact on sugar. Cortisol management. Mindfulness tips." },
      { week: 8, theme: "Advanced Monitoring", goal: "Continuous glucose pattern analysis. HbA1c estimation." },
    ];
    for (let w = 1; w <= weeks; w++) {
      weekThemes.push(diabetesThemes[w - 1] || { week: w, theme: `Week ${w} Focus`, goal: "Continue building healthy habits and maintain consistency." });
    }
  } else if (isHypertension) {
    const bpThemes = [
      { week: 1, theme: "BP Baseline & Habits", goal: "Establish baseline readings. Morning + evening BP logs." },
      { week: 2, theme: "Sodium & Diet", goal: "Salt reduction tips. Indian diet modification. DASH diet basics." },
      { week: 3, theme: "Stress & Heart Health", goal: "Stress management. Walking programme. Sleep quality check." },
      { week: 4, theme: "Medication Review", goal: "Adherence check. Doctor visit prep. Long-term plan conversion." },
    ];
    for (let w = 1; w <= weeks; w++) {
      weekThemes.push(bpThemes[w - 1] || { week: w, theme: `Week ${w} Focus`, goal: "Maintain consistent BP tracking and healthy habits." });
    }
  } else if (isPcos) {
    const pcosThemes = [
      { week: 1, theme: "Baseline & Symptoms", goal: "Track cycle, weight, and symptoms. Medication baseline." },
      { week: 2, theme: "Low-GI Nutrition", goal: "Indian low-GI foods. Avoid refined carbs. Meal timing." },
      { week: 3, theme: "Exercise & Hormones", goal: "Strength training + cardio mix. Stress reduction. Sleep." },
      { week: 4, theme: "Progress & Next Steps", goal: "Progress report. Hormonal markers review. Plan continuation." },
    ];
    for (let w = 1; w <= weeks; w++) {
      weekThemes.push(pcosThemes[w - 1] || { week: w, theme: `Week ${w} Focus`, goal: "Continue balanced lifestyle for hormonal health." });
    }
  } else {
    // Generic chronic condition themes
    const genericThemes = [
      { week: 1, theme: "Onboarding & Baseline", goal: "Establish logging habits. Baseline health metrics. Goal setting." },
      { week: 2, theme: "Pattern Analysis", goal: "Identify triggers and trends. Refine tracking." },
      { week: 3, theme: "Lifestyle Integration", goal: "Diet, sleep, exercise balance. Complication screening." },
      { week: 4, theme: "Results & Conversion", goal: "Report to doctor. Progress celebration. Continue programme." },
    ];
    for (let w = 1; w <= weeks; w++) {
      weekThemes.push(genericThemes[w - 1] || { week: w, theme: `Week ${w} Focus`, goal: "Build consistent daily health tracking habits." });
    }
  }

  // ─ Reward tiers ─
  const rewardTiers = [
    { name: "Bronze", min_mhp: 1200, reward: "Free lab test at partner clinic | 10% off next program plan", color: "#b45309" },
    { name: "Silver", min_mhp: 3000, reward: "Free HbA1c test | 1 complimentary teleconsultation with the treating physician", color: "#6b7280" },
    { name: "Gold", min_mhp: 5000, reward: "90-day Chronic Care Plan at 50% off | Mediimate Premium badge | Priority physician access", color: "#d97706" },
  ];

  // ─ Description ─
  const goalsText = goals ? ` Goals: ${goals}.` : "";
  const description = `A structured ${dur}-day program for ${condition} patients with daily check-ins, ${isDiabetes ? "blood sugar and medication tracking" : isHypertension ? "BP monitoring and lifestyle coaching" : "vital tracking and medication adherence"}, complication screening, and MHP reward points.${goalsText}`;

  // ─ Cover color ─
  const coverColor = isDiabetes ? "#16a34a" : isHypertension ? "#dc2626" : isObesity ? "#7c3aed" : isCholesterol ? "#ea580c" : isThyroid ? "#0369a1" : isPcos ? "#db2777" : isAsthma ? "#0891b2" : "#2563eb";

  // ─ Name & slug ─
  const name = `${dur}-Day ${condition} Chronic Care Program`;
  const slugBase = `${dur}-day-${String(condition).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  return res.json({
    name,
    slug: `${slugBase}-${Date.now()}`,
    condition,
    duration_days: dur,
    description,
    cover_color: coverColor,
    scoring_rules: scoring,
    reward_tiers: rewardTiers,
    week_themes: weekThemes,
  });
});

// ─── POST /care-plans/wizard-generate — Gemini day-by-day plan builder ───
router.post("/care-plans/wizard-generate", requireAuth, async (req, res) => {
  const { category, duration_days, clinical_params: cp = {}, plan_name } = req.body;
  if (!category) return res.status(400).json({ error: "category required" });
  const dur = Math.max(1, Number(duration_days) || 30);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const COLOR: Record<string, string> = {
    diabetes: "#16a34a", ortho: "#0369a1", hair: "#7c3aed",
    weight_loss: "#ea580c", cardio: "#dc2626", custom: "#2563eb",
  };
  const coverColor = COLOR[category] ?? "#2563eb";

  // Safely convert a value that may be a string, array, or undefined to a comma-joined string
  const toList = (val: any, fallback: string): string => {
    if (!val) return fallback;
    if (Array.isArray(val)) return val.join(", ") || fallback;
    if (typeof val === "string") return val.trim() || fallback;
    return fallback;
  };

  const categoryPrompts: Record<string, string> = {
    diabetes: `You are a clinical care programme designer for diabetes management in India.
Generate a ${dur}-day diabetic care programme with day-by-day tasks.
Patient Profile: ${cp.patient_profile || "general Type 2 diabetic"}
Monitoring: ${toList(cp.monitoring, "fasting_glucose, postmeal_glucose")}
Medications: ${toList(cp.medications, "oral antidiabetics")}
HbA1c Target: ${cp.hba1c_target || "7"}%
Complications to screen: ${toList(cp.complications, "standard set")}

Rules:
- Return EXACTLY ${dur} day objects
- Each day: 2-4 tasks; vary types across the week
- Types: vital=glucose/BP readings (points 10), medicine=medication log (points 5), action=exercise/foot check/photo (points 10), education=tip (points 5)
- Day 1: onboarding & baseline; days 7/14/21/30: milestone recap; every ~10th day: complication screen
- Be specific to diabetes — include fasting glucose, post-meal glucose, foot care, medication adherence`,

    ortho: `You are a physiotherapist specialising in orthopaedic rehabilitation.
Generate a ${dur}-day rehab programme.
Condition: ${cp.condition || "general musculoskeletal"}
Affected area: ${cp.affected_area || "not specified"}
Rehab phase: ${cp.phase || "sub-acute"}
Intensity: ${cp.intensity || "moderate"}
Restrictions: ${toList(cp.restrictions, "none")}

Rules:
- Return EXACTLY ${dur} day objects
- Each day: 2-4 tasks: vital=pain scale/ROM (10pts), medicine=pain meds (5pts), action=exercise/stretch (10pts), education=technique tip (5pts)
- Progressive load: gentle Week 1 → strength Week 2 → functional Week 3+
- Day 1: baseline assessment; day 7: strength intro; day 14: functional exercises
- Exercises specific to ${cp.affected_area || "the affected area"}`,

    hair: `You are a trichologist specialising in hair loss and scalp health.
Generate a ${dur}-day hair restoration programme.
Hair loss type: ${cp.hair_loss_type || "androgenetic alopecia"}
Treatment: ${toList(cp.treatment, "topical minoxidil")}
Monitoring: ${toList(cp.monitoring, "scalp photos, shedding log")}

Rules:
- Return EXACTLY ${dur} day objects
- 2-3 tasks/day: medicine=serums/supplements (5pts), action=scalp massage/photos/wash (10pts), vital=shedding count (10pts), education=hair tip (5pts)
- Day 1: baseline photos; every 7th day: progress photo + shedding assessment
- Include massage technique, PH-balanced wash schedule, nutrition reminders`,

    weight_loss: `You are a bariatric nutritionist and fitness coach.
Generate a ${dur}-day weight management programme for Indian patients.
Approach: ${cp.approach || "calorie deficit"}
Starting activity: ${cp.activity_level || "sedentary"}
Focus: ${cp.focus || "diet and exercise"}

Rules:
- Return EXACTLY ${dur} day objects
- 2-4 tasks/day: vital=weight/waist log (10pts), action=exercise/steps (10pts), education=nutrition tip (5pts), medicine=supplement (5pts)
- Progressive: Foundation wk1 → Habit building wk2 → Intensify wk3+
- Include Indian diet-specific guidance`,

    cardio: `You are a cardiologist specialising in cardiac rehabilitation.
Generate a ${dur}-day cardiac care programme.
Condition: ${cp.condition || "hypertension"}
Monitoring: ${toList(cp.monitoring, "bp, weight")}
Intensity: ${cp.intensity || "low"}

Rules:
- Return EXACTLY ${dur} day objects
- 2-4 tasks/day: vital=BP/weight (10pts), medicine=cardiac meds (5pts), action=walking/breathing (10pts), education=heart health tip (5pts)
- Conservative progression; include sodium reduction, stress management
- Milestone days: warnings about danger signs`,

    custom: `You are a clinical care programme designer.
Generate a ${dur}-day custom care programme.
Condition: ${cp.condition || "general wellness"}
Goals: ${cp.goals || "improve health outcomes"}
What to track: ${cp.track || "vitals and lifestyle"}
Special instructions: ${cp.instructions || "none"}

Rules:
- Return EXACTLY ${dur} day objects
- 2-4 tasks/day with appropriate types and points
- Be specific to the condition described`,
  };

  const categoryPrompt = categoryPrompts[category] ?? categoryPrompts.custom;
  const defaultName = plan_name || `${dur}-Day ${category.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} Programme`;

  const prompt = `${categoryPrompt}

Return ONLY raw valid JSON with NO markdown fences:
{
  "name": "${defaultName}",
  "description": "One sentence describing the programme.",
  "days": [
    {
      "day": 1,
      "theme": "...",
      "tasks": [
        {"id": "d1-t1", "title": "...", "description": "...", "type": "vital", "points": 10}
      ]
    }
  ]
}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const rawText = (response.text || "").trim();
    // Extract the JSON object — strip markdown fences or any prose wrapper
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini returned no JSON object in response");
    const data = JSON.parse(jsonMatch[0]);
    if (!data.days || !Array.isArray(data.days)) throw new Error("Gemini response missing 'days' array");
    return res.json({ name: data.name, description: data.description, cover_color: coverColor, days: data.days });
  } catch (err: any) {
    console.error("Wizard Gemini error:", err?.message || err, err?.stack);
    return res.status(500).json({ error: "Failed to generate plan — " + (err?.message || "unknown error") });
  }
});

// ─── POST /care-plans/create — Doctor creates a care plan ───
router.post("/care-plans/create", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  if ((roleDoc as { role?: string })?.role !== "doctor") {
    return res.status(403).json({ error: "Only doctors can create care plans" });
  }

  const { name, slug, condition, duration_days, description, cover_color, scoring_rules, reward_tiers, week_themes, days } = req.body;
  if (!name || !condition) return res.status(400).json({ error: "name and condition required" });

  // Ensure unique slug
  const finalSlug = slug || `${duration_days || 30}-day-${String(condition).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  const existing = await CarePlan.findOne({ slug: finalSlug }).lean();
  if (existing) return res.status(409).json({ error: "A care plan with this slug already exists" });

  const plan = await CarePlan.create({
    name,
    slug: finalSlug,
    condition,
    duration_days: Number(duration_days) || 30,
    description: description || "",
    cover_color: cover_color || "#16a34a",
    scoring_rules: scoring_rules || {},
    reward_tiers: reward_tiers || [],
    week_themes: week_themes || [],
    days: days || [],
    is_active: true,
    created_by: userId,
  });

  return res.status(201).json({ ...plan.toObject(), id: plan._id.toString(), _id: undefined, __v: undefined });
});

// ─── GET /care-plans/:id — Get a single care plan details ───
router.get("/care-plans/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid care plan ID" });
  }
  const plan = await CarePlan.findById(id).lean();
  if (!plan) return res.status(404).json({ error: "Care plan not found" });
  return res.json({ ...(plan as any), id: (plan as any)._id?.toString(), _id: undefined, __v: undefined });
});

// ─── GET /care-plans/:id/summary — Full patient stats for a care plan ───
router.get("/care-plans/:id/summary", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid care plan ID" });
  }
  const plan = await CarePlan.findById(id).lean();
  if (!plan) return res.status(404).json({ error: "Care plan not found" });

  const assignments = await CarePlanAssignment.find({ careplan_id: id }).sort({ mhp_balance: -1 }).lean();

  const patientIds = (assignments as any[]).map((a) => a.patient_id);
  const patients = await Patient.find({ _id: { $in: patientIds } }).select("_id full_name phone age gender conditions").lean();
  const patientMap = new Map((patients as any[]).map((p) => [p._id.toString(), p]));

  const patientStats = (assignments as any[]).map((a) => {
    const pat = patientMap.get(a.patient_id) || {};
    const daysLogged = (a.day_logs || []).filter(
      (d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken
    ).length;
    const adherence = a.current_day > 0 ? Math.round((daysLogged / a.current_day) * 100) : 0;

    const fastingReadings = (a.day_logs || []).filter((d: any) => d.fasting_sugar != null).map((d: any) => d.fasting_sugar);
    const avgFasting = fastingReadings.length > 0 ? Math.round(fastingReadings.reduce((s: number, v: number) => s + v, 0) / fastingReadings.length) : null;

    const medsDays = (a.day_logs || []).filter((d: any) => d.meds_taken).length;
    const medAdherence = a.current_day > 0 ? Math.round((medsDays / a.current_day) * 100) : 0;

    return {
      assignment_id: a._id?.toString(),
      patient_id: a.patient_id,
      full_name: (pat as any).full_name || "Unknown",
      phone: (pat as any).phone || "",
      age: (pat as any).age,
      gender: (pat as any).gender,
      conditions: (pat as any).conditions || [],
      status: a.status,
      current_day: a.current_day || 0,
      duration_days: (plan as any).duration_days,
      adherence_pct: adherence,
      med_adherence_pct: medAdherence,
      mhp_balance: a.mhp_balance || 0,
      mhp_tier: a.mhp_tier,
      streak_days: a.streak_days || 0,
      last_log_date: a.last_log_date,
      avg_fasting_sugar: avgFasting,
      complications_screened: a.complications_screened || {},
      appointment_booked: !!a.appointment_booked,
      enrolled_at: a.enrolled_at,
    };
  });

  // Aggregate stats
  const totalEnrolled = patientStats.length;
  const avgAdherence = totalEnrolled > 0
    ? Math.round(patientStats.reduce((s, p) => s + p.adherence_pct, 0) / totalEnrolled)
    : 0;
  const avgMhp = totalEnrolled > 0
    ? Math.round(patientStats.reduce((s, p) => s + p.mhp_balance, 0) / totalEnrolled)
    : 0;
  const tierCounts = { Bronze: 0, Silver: 0, Gold: 0, None: 0 };
  for (const p of patientStats) {
    const t = p.mhp_tier as keyof typeof tierCounts;
    if (t && tierCounts[t] !== undefined) tierCounts[t]++;
    else tierCounts.None++;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const loggedToday = patientStats.filter((p) => p.last_log_date === todayStr).length;

  return res.json({
    plan: { ...(plan as any), id: (plan as any)._id?.toString(), _id: undefined, __v: undefined },
    total_enrolled: totalEnrolled,
    avg_adherence: avgAdherence,
    avg_mhp: avgMhp,
    logged_today: loggedToday,
    tier_counts: tierCounts,
    patients: patientStats,
  });
});

// ─── POST /care-plans/:id/add-patient — Add patient to care plan by phone ───
router.post("/care-plans/:id/add-patient", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  if ((roleDoc as { role?: string })?.role !== "doctor") {
    return res.status(403).json({ error: "Only doctors can add patients" });
  }

  const { id: careplanId } = req.params;
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone number required" });

  const careplan = await CarePlan.findById(careplanId).lean();
  if (!careplan) return res.status(404).json({ error: "Care plan not found" });

  // Normalize phone number
  const phoneNorm = String(phone).replace(/[\s\-\(\)\.]/g, "");
  const phoneLocal = phoneNorm.replace(/^\+91/, "");

  const patient = await Patient.findOne({
    $or: [
      { phone: phoneNorm },
      { phone: `+91${phoneLocal}` },
      { phone: phoneLocal },
    ],
  }).lean();

  if (!patient) {
    return res.status(404).json({
      error: "No patient found with this phone number. They must be registered in Mediimate first.",
    });
  }

  const patientId = (patient as any)._id.toString();

  // Check not already enrolled
  const existing = await CarePlanAssignment.findOne({
    patient_id: patientId,
    careplan_id: careplanId,
    status: "active",
  }).lean();

  if (existing) {
    return res.status(409).json({ error: "Patient is already enrolled in this care plan" });
  }

  // Create assignment starting tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const assignment = await CarePlanAssignment.create({
    careplan_id: careplanId,
    patient_id: patientId,
    doctor_id: userId,
    status: "active",
    start_date: tomorrow,
    current_day: 0,
    enrolled_at: new Date(),
  });

  // Notify patient
  if ((patient as any).patient_user_id) {
    await Notification.create({
      user_id: (patient as any).patient_user_id,
      title: "You've been added to a Care Plan!",
      message: `Your doctor has enrolled you in "${(careplan as any).name}". It starts tomorrow!`,
      category: "careplan",
      type: "success",
      is_read: false,
      related_type: "careplan_assignment",
      related_id: assignment._id.toString(),
    });
  }

  return res.status(201).json({
    patient: {
      id: patientId,
      full_name: (patient as any).full_name,
      phone: (patient as any).phone,
    },
    assignment_id: assignment._id.toString(),
    message: `${(patient as any).full_name} has been added to the care plan`,
  });
});

// ─── GET /me/careplans — All active enrolments (for tile selection) ───
router.get("/me/careplans", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });

  const filter = link.patient_ids.length > 1
    ? { patient_id: { $in: link.patient_ids }, status: "active" }
    : { patient_id: link.patient_id, status: "active" };

  const assignments = await CarePlanAssignment.find(filter).lean();
  if (!assignments.length) return res.json([]);

  const careplans = await CarePlan.find({ _id: { $in: assignments.map((a: any) => a.careplan_id) } }).lean();
  const planMap = new Map(careplans.map((cp: any) => [cp._id.toString(), cp]));

  const result = assignments.map((a: any) => {
    const cp = planMap.get(a.careplan_id?.toString()) as any;
    const start = new Date(a.start_date);
    const now = new Date();
    const currentDay = cp
      ? Math.min(Math.max(Math.ceil((now.getTime() - start.getTime()) / 86400000), 1), cp.duration_days)
      : (a.current_day || 1);

    const daysLogged = (a.day_logs || []).filter(
      (d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken
    ).length;

    return {
      assignment_id: a._id.toString(),
      careplan_id: a.careplan_id?.toString(),
      name: cp?.name || "Care Plan",
      description: cp?.description || "",
      cover_color: cp?.cover_color || "#059669",
      duration_days: cp?.duration_days || 30,
      current_day: currentDay,
      mhp_balance: a.mhp_balance || 0,
      mhp_tier: a.mhp_tier || "None",
      streak_days: a.streak_days || 0,
      days_logged: daysLogged,
      status: a.status,
    };
  });

  return res.json(result);
});

export default router;
