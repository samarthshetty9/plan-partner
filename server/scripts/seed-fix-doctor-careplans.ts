/**
 * Fixes:
 * 1. Sets created_by = DOCTOR_USER_ID on the existing 30-day diabetes plan
 * 2. Creates a second care plan (Hypertension + Diabetes Combo) owned by the doctor
 * 3. Enrolls demo@mediimate.in (Rahul Kumar) in the second plan with 10 days of data
 *    so he has TWO active care plan enrollments
 * Run: cd server && npx tsx scripts/seed-fix-doctor-careplans.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import {
  CarePlan,
  CarePlanAssignment,
  Patient,
  AuthUser,
  Notification,
} from "../models/index.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/plan-partner";
const DOCTOR_USER_ID = process.env.SEED_DOCTOR_USER_ID || "e0697d5c-a726-4e3e-8da3-ee72b99f6999";

function ri(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rb(p: number) {
  return Math.random() < p;
}
function dateNDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  // ── 1. Link existing 30-day-diabetes plan to the doctor ──────────
  const diabPlan = await CarePlan.findOneAndUpdate(
    { slug: "30-day-diabetes" },
    { $set: { created_by: DOCTOR_USER_ID } },
    { new: true }
  ).lean();

  if (!diabPlan) {
    console.error("ERROR: 30-day-diabetes plan not found. Run seed-careplan.ts first.");
    process.exit(1);
  }
  console.log(`✓ 30-day-diabetes plan now linked to doctor (id: ${(diabPlan as any)._id})`);

  // ── 2. Also link all existing assignments to this doctor ──────────
  const carbAssigned = await CarePlanAssignment.updateMany(
    { careplan_id: (diabPlan as any)._id.toString() },
    { $set: { doctor_id: DOCTOR_USER_ID } }
  );
  console.log(`  Updated ${carbAssigned.modifiedCount} assignment(s) → doctor_id set`);

  // ── 3. Create the second care plan ───────────────────────────────
  const SLUG2 = "30-day-hypertension-diabetes-combo";
  let plan2 = await CarePlan.findOne({ slug: SLUG2 }).lean();
  if (!plan2) {
    plan2 = await CarePlan.create({
      name: "30-Day Hypertension + Diabetes Combined Program",
      slug: SLUG2,
      condition: "Hypertension & Type 2 Diabetes",
      duration_days: 30,
      is_active: true,
      description:
        "A 30-day dual-management program targeting BP control and blood sugar stabilisation with daily vitals tracking, medication adherence, lifestyle coaching, and MHP reward points.",
      cover_color: "#dc2626",
      created_by: DOCTOR_USER_ID,
      scoring_rules: {
        fasting_sugar_log: 10,
        postmeal_sugar_log: 10,
        bp_log: 10,
        medicine_confirm: 5,
        meal_log: 5,
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
        { name: "Bronze", min_mhp: 1200, reward: "Free BP monitoring kit | 10% off next program plan", color: "#b45309" },
        { name: "Silver", min_mhp: 3000, reward: "Free HbA1c + Lipid panel | 1 complimentary teleconsultation with the treating physician", color: "#6b7280" },
        { name: "Gold", min_mhp: 5000, reward: "90-day Chronic Care Plan at 50% off | Mediimate Premium badge | Priority physician access", color: "#d97706" },
      ],
      week_themes: [
        { week: 1, theme: "Foundation & Baselines", goal: "Establish AM/PM BP + fasting sugar habit. Medication timing." },
        { week: 2, theme: "Pattern & Triggers", goal: "Identify BP/sugar correlation. Sodium reduction. Stress check." },
        { week: 3, theme: "Complications Screening", goal: "Eye, kidney, nerve, heart screening. Cardio-metabolic risk review." },
        { week: 4, theme: "Optimisation & Results", goal: "Adjust targets. Book follow-up. Plan continuation." },
      ],
    });
    console.log(`✓ Created second care plan: "${(plan2 as any).name}" (${(plan2 as any)._id})`);
  } else {
    console.log(`  Second care plan already exists: ${SLUG2}`);
  }
  const plan2Id = (plan2 as any)._id.toString();

  // ── 4. Find Rahul Kumar (demo@mediimate.in) ───────────────────────
  const demoAuth = await AuthUser.findOne({ email: "demo@mediimate.in" }).lean();
  if (!demoAuth) {
    console.error("ERROR: demo@mediimate.in not found. Run seed-careplan.ts first.");
    process.exit(1);
  }
  const demoUserId = (demoAuth as any).user_id;
  const rahul = await Patient.findOne({ patient_user_id: demoUserId }).lean();
  if (!rahul) {
    console.error("ERROR: Patient record for demo@mediimate.in not found.");
    process.exit(1);
  }
  const rahulPatientId = (rahul as any)._id.toString();
  console.log(`\nFound demo patient: ${(rahul as any).full_name} (${rahulPatientId})`);

  // ── 5. Enroll Rahul in the first plan (ensure doctor_id is correct) ─
  const existingDiabAssign = await CarePlanAssignment.findOne({
    patient_id: rahulPatientId,
    careplan_id: (diabPlan as any)._id.toString(),
  }).lean();
  if (existingDiabAssign) {
    await CarePlanAssignment.updateOne(
      { _id: (existingDiabAssign as any)._id },
      { $set: { doctor_id: DOCTOR_USER_ID } }
    );
    console.log(`✓ Rahul's existing 30-day-diabetes enrollment linked to doctor`);
  } else {
    console.log(`  (Rahul has no 30-day-diabetes enrollment — run seed-careplan.ts)`);
  }

  // ── 6. Enroll Rahul in the SECOND plan (10 days of data) ─────────
  await CarePlanAssignment.deleteMany({
    patient_id: rahulPatientId,
    careplan_id: plan2Id,
  });

  const startDate = dateNDaysAgo(10);
  const dayLogs: any[] = [];
  const mhpHistory: any[] = [];
  let mhp = 0;
  let streak = 0;
  let lastLogDate = "";

  for (let day = 1; day <= 10; day++) {
    const logDate = new Date(startDate);
    logDate.setDate(logDate.getDate() + day - 1);
    const dateStr = fmtDate(logDate);

    const missed = day === 6; // one missed day for realism

    if (missed) {
      streak = 0;
      dayLogs.push({
        day, date: logDate,
        fasting_sugar: null, postmeal_sugar: null, bp_systolic: null, bp_diastolic: null,
        meds_taken: false, meals_logged: 0, foot_check_done: false, workout_logged: false,
        mhp_earned_today: 0, escalation_triggered: false, notes: "",
      });
      continue;
    }

    const fasting = ri(118, 148);
    const postmeal = day >= 4 ? ri(155, 200) : null;
    const bpSys = ri(132, 152);
    const bpDia = ri(80, 92);
    const meds = rb(0.88);
    const meals = ri(1, 3);
    const workout = rb(0.30);

    let pts = 0;
    const add = (action: string, p: number) => { pts += p; mhpHistory.push({ action, points: p, date: logDate, day }); };

    add("fasting_sugar_log", 10);
    add("bp_log", 10);
    if (postmeal) add("postmeal_sugar_log", 10);
    if (meds) add("medicine_confirm", 5);
    for (let m = 0; m < meals; m++) add("meal_log", 5);
    if (workout) add("workout_log", 10);

    streak++;
    lastLogDate = dateStr;
    if (streak === 3) add("streak_3day", 25);
    if (streak === 7) add("streak_7day", 75);

    mhp += pts;
    dayLogs.push({
      day, date: logDate,
      fasting_sugar: fasting,
      postmeal_sugar: postmeal,
      bp_systolic: bpSys,
      bp_diastolic: bpDia,
      meds_taken: meds,
      meals_logged: meals,
      foot_check_done: false,
      workout_logged: workout,
      mhp_earned_today: pts,
      escalation_triggered: false,
      notes: "",
    });
  }

  const tier2 = mhp >= 5000 ? "Gold" : mhp >= 3000 ? "Silver" : mhp >= 1200 ? "Bronze" : null;

  await CarePlanAssignment.create({
    careplan_id: plan2Id,
    patient_id: rahulPatientId,
    doctor_id: DOCTOR_USER_ID,
    status: "active",
    enrolled_at: startDate,
    start_date: startDate,
    current_day: 10,
    onboarding_complete: true,
    onboarding_step: 3,
    diabetes_type: "tablets",
    medicines: (rahul as any).medications || ["Metformin 500mg", "Amlodipine 5mg"],
    baseline_sugar: 175,
    baseline_timing: "fasting",
    complications: ["Hypertension"],
    mhp_balance: mhp,
    mhp_tier: tier2,
    mhp_history: mhpHistory,
    streak_days: streak,
    last_log_date: lastLogDate,
    day_logs: dayLogs,
    complications_screened: { eye: false, kidney: false, nerve: false, heart: false },
    appointment_booked: false,
    escalations_count: 0,
    escalation_log: [],
    rewards_claimed: { bronze: false, silver: false, gold: false },
  });

  console.log(`✓ Rahul enrolled in "${(plan2 as any).name}" — day 10, ${mhp} MHP (${tier2 || "None"})`);

  // Notification
  await Notification.create({
    user_id: demoUserId,
    title: "New Care Plan Added!",
    message: `Your doctor has enrolled you in "${(plan2 as any).name}". You're now in 2 active programs!`,
    category: "careplan",
    type: "success",
    is_read: false,
    related_type: "careplan_assignment",
  });

  // ── Summary ─────────────────────────────────────────────────────
  const totalAssignments = await CarePlanAssignment.countDocuments({ patient_id: rahulPatientId });
  const totalPlans = await CarePlan.countDocuments({ is_active: true });

  console.log("\n──────────────────────────────────────────────────────");
  console.log(`✅  Done!`);
  console.log(`   Active care plans in DB : ${totalPlans}`);
  console.log(`   Rahul's enrollments     : ${totalAssignments} plans`);
  console.log(`   Doctor (demodoc)        : doc@mediimate.in / DocDemo1234!`);
  console.log(`   Patient (demo)          : demo@mediimate.in / Demo1234!`);
  console.log("──────────────────────────────────────────────────────\n");

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
