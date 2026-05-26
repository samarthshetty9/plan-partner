import { Router, Request } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import webpush from "web-push";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { LIMITS, parseLimit, parseSkip } from "../constants.js";
import {
  Alert,
  AuthUser,
  Appointment,
  AppointmentCheckin,
  Clinic,
  ClinicInvite,
  ClinicMember,
  DoctorAvailability,
  Enrollment,
  Feedback,
  FeedbackRequest,
  FoodLog,
  LabReport,
  LabResult,
  LinkRequest,
  MedicationLog,
  Notification,
  ReminderEscalation,
  Patient,
  PatientDocument,
  PatientDoctorLink,
  PatientVaultCode,
  Profile,
  Program,
  PushSubscription,
  QuickLogToken,
  UserRole,
  Vital,
  FamilyConnection,
  DoctorMessage,
  UserBadge,
  UserWeeklyChallenge,
  MilestoneReward,
  Medication,
  PatientGamification,
  VoiceConversation,
  ChatConversation,
  HealthNote,
  ContactLead,
  Case,
  HospitalReview,
} from "../models/index.js";
import {
  sendVitalsLoggedEmail,
  sendMedicationReminderEmail,
  sendMedicationLoggedEmail,
  sendFoodLoggedEmail,
  sendConsultationSummaryEmail,
  sendNewPatientLinkedEmail,
  sendCriticalVitalsAlertEmail,
  sendFamilyInvitationEmail,
  sendDoctorMessageEmail,
  sendAppointmentBookedEmail,
  sendAppointmentRequestedEmail,
  sendAppointmentRequestDoctorEmail,
  sendAppointmentDeclinedEmail,
  sendAppointmentCompletedEmail,
  sendBadgeEarnedEmail,
  sendStreakMilestoneEmail,
  sendEscalationReminderEmail,
  sendDoctorPatientMissedAlertEmail,
  sendMedicationMissedEmail,
  sendAppointmentReminderEmail,
  sendDailyHealthSummaryEmail,
  sendWeeklyComplianceEmail,
} from "../services/email.js";
import { whatsapp } from "../services/whatsapp.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${(file.originalname || "file").replace(/[^a-zA-Z0-9.-]/g, "_")}`),
  }),
});

type AuthRequest = Request & { user: { id: string } };

/** For clinic-role users, returns their clinic_id; otherwise null. */
async function getClinicIdForUser(userId: string): Promise<string | null> {
  const u = await AuthUser.findOne({ user_id: userId }).select("clinic_id").lean();
  return (u as { clinic_id?: string } | null)?.clinic_id ?? null;
}

/** True if current user can act for this clinic (member as owner/admin, or clinic role with this clinic_id). */
async function canActForClinic(userId: string, clinicId: string): Promise<boolean> {
  const asClinic = await getClinicIdForUser(userId);
  if (asClinic === clinicId) return true;
  const member = await ClinicMember.findOne({ clinic_id: clinicId, user_id: userId }).lean();
  const role = (member as { role?: string } | null)?.role;
  return role === "owner" || role === "admin";
}

/** True if doctor can access this patient (owns the Patient record or has active PatientDoctorLink). */
async function doctorCanAccessPatient(doctorId: string, patientId: string): Promise<boolean> {
  if (!patientId) return false;
  const patient = await Patient.findById(patientId).select("doctor_id patient_user_id").lean();
  if (!patient) return false;
  const p = patient as { doctor_id: string; patient_user_id?: string };
  if (p.doctor_id === doctorId) return true;
  if (p.patient_user_id) {
    const link = await PatientDoctorLink.findOne({ doctor_user_id: doctorId, patient_user_id: p.patient_user_id, status: "active" }).lean();
    return !!link;
  }
  return false;
}

async function getAiVitalRemark(vitalType: string, valueText: string, unit?: string | null): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const label = vitalType.replace(/_/g, " ");
  const prompt = `You are a clinical assistant. Given this vital sign reading, write ONE short sentence (max 15 words) as a remark for the notes field. Be factual and neutral. No disclaimer.
Vital: ${label}. Value: ${valueText}${unit ? ` ${unit}` : ""}.
Reply with only the remark, no quotes or prefix.`;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 80 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text && text.length <= 200 ? text : null;
  } catch {
    return null;
  }
}

// ---------- Auth: register/login are in routes/auth.ts (mounted first in app). Me and rest here ----------
function generateDoctorCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "DR";
  for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(0, chars.length)];
  return code;
}

router.get("/auth/me", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const [profile, roleDoc, patientExisting, authUser] = await Promise.all([
    Profile.findOne({ user_id: userId }).lean(),
    UserRole.findOne({ user_id: userId }).lean(),
    Patient.findOne({ patient_user_id: userId }).lean(),
    AuthUser.findOne({ user_id: userId }).select("clinic_id email_verified email approval_status").lean(),
  ]);
  const role = (roleDoc as { role?: string; clinic_id?: string })?.role ?? null;
  const clinicId = (roleDoc as { clinic_id?: string })?.clinic_id ?? (authUser as { clinic_id?: string })?.clinic_id;

  let profileForOut = profile as { _id?: unknown; user_id?: string; doctor_code?: string; full_name?: string; [k: string]: unknown } | null;
  if (role === "doctor" && profileForOut && !profileForOut.doctor_code) {
    let code = generateDoctorCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const existing = await Profile.findOne({ doctor_code: code }).lean();
      if (!existing) break;
      code = generateDoctorCode();
    }
    await Profile.findOneAndUpdate({ user_id: userId }, { $set: { doctor_code: code } });
    profileForOut = { ...profileForOut, doctor_code: code };
  }

  let patient = patientExisting;
  if (!patient && role === "patient") {
    const created = await Patient.create({
      patient_user_id: userId,
      doctor_id: userId,
      full_name: (profileForOut as { full_name?: string })?.full_name || "Patient",
      phone: " ",
      status: "active",
    });
    patient = created.toObject ? created.toObject() : (created as any);
  }

  let clinicOut = null;
  if (role === "clinic" && clinicId) {
    const clinic = await Clinic.findById(clinicId).lean();
    if (clinic) {
      clinicOut = { ...clinic, id: (clinic as any)._id?.toString(), _id: undefined, __v: undefined };
    }
  }

  const profileOut = profileForOut ? { ...profileForOut, id: (profileForOut as any)._id?.toString(), _id: undefined, __v: undefined } : null;
  const patientOut = patient ? { ...patient, id: (patient as any)._id?.toString(), _id: undefined, __v: undefined } : null;
  // Auto-verify users who signed up before the email verification feature (no email_verified field)
  let isVerified = !!(authUser as any)?.email_verified;
  if (!isVerified && authUser) {
    const createdAt = (authUser as any).createdAt || (authUser as any).created_at;
    // Users created before 2026-02-17 are grandfathered in as verified
    if (createdAt && new Date(createdAt) < new Date("2026-02-17T00:00:00Z")) {
      isVerified = true;
      AuthUser.updateOne({ user_id: userId }, { $set: { email_verified: true } }).catch(() => {});
    }
  }

  const approvalStatus = (authUser as any)?.approval_status || "active";

  // For doctors, include list of connected clinics (via ClinicMember)
  let connectedClinics: { id: string; name: string; member_role: string }[] = [];
  if (role === "doctor") {
    const memberships = await ClinicMember.find({ user_id: userId }).select("clinic_id role").lean();
    if (memberships.length) {
      const cIds = [...new Set((memberships as any[]).map((m) => m.clinic_id))];
      const objIds = cIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
      const cDocs = objIds.length ? await Clinic.find({ _id: { $in: objIds } }).select("name").lean() : [];
      const nameMap = new Map(cDocs.map((c: any) => [c._id.toString(), c.name || "Clinic"]));
      connectedClinics = (memberships as any[])
        .filter((m) => nameMap.has(m.clinic_id))
        .map((m) => ({ id: m.clinic_id, name: nameMap.get(m.clinic_id)!, member_role: m.role }));
    }
  }

  return res.json({
    user: { id: userId, email: (authUser as any)?.email },
    profile: profileOut,
    role,
    patient: role === "clinic" ? null : patientOut,
    clinic: clinicOut,
    email_verified: isVerified,
    approval_status: approvalStatus,
    connected_clinics: connectedClinics,
  });
});

// ---------- Doctor: switch to clinic portal (when clinic has its own login) ----------
/** Returns ALL clinics the doctor is a member of (any role: owner, admin, doctor, nurse, staff). */
router.get("/auth/switchable-clinics", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  const role = (roleDoc as { role?: string })?.role;
  if (role !== "doctor") return res.json([]);
  const memberships = await ClinicMember.find({ user_id: userId }).select("clinic_id role").lean();
  const clinicIds = [...new Set((memberships as { clinic_id: string }[]).map((m) => m.clinic_id))];
  if (!clinicIds.length) return res.json([]);
  const objectIds = clinicIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const clinics = objectIds.length > 0 ? await Clinic.find({ _id: { $in: objectIds } }).select("name").lean() : [];
  const clinicMap = new Map(clinics.map((c: any) => [c._id.toString(), c.name || "Clinic"]));
  const memberRoleMap = new Map((memberships as any[]).map((m) => [m.clinic_id, m.role]));
  return res.json(clinicIds.filter((id) => clinicMap.has(id)).map((id) => ({
    id,
    name: clinicMap.get(id),
    member_role: memberRoleMap.get(id) || "doctor",
    can_manage: memberRoleMap.get(id) === "owner" || memberRoleMap.get(id) === "admin",
  })));
});

router.post("/auth/switch-to-clinic", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { clinic_id } = req.body;
  if (!clinic_id) return res.status(400).json({ error: "clinic_id required" });
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  if ((roleDoc as { role?: string })?.role !== "doctor") return res.status(403).json({ error: "Only doctors can switch to clinic" });
  const member = await ClinicMember.findOne({ clinic_id, user_id: userId }).lean();
  if (!member) return res.status(404).json({ error: "Clinic not found" });
  const memRole = (member as { role?: string }).role;
  if (memRole !== "owner" && memRole !== "admin") return res.status(403).json({ error: "Only clinic owner or admin can switch to clinic portal" });
  const clinicUser = await AuthUser.findOne({ clinic_id }).select("user_id").lean();
  if (!clinicUser) return res.status(404).json({ error: "This clinic does not have a separate login yet" });
  const token = jwt.sign({ sub: (clinicUser as any).user_id }, JWT_SECRET, { expiresIn: "7d" });
  return res.json({ token });
});

// ---------- Patient self-service: /me/* (current user's linked patient) ----------
router.get("/me/enrollments", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await Enrollment.find(filter).sort({ enrolled_at: -1 }).limit(20).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/me/appointments", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await Appointment.find(filter).sort({ scheduled_at: -1 }).limit(20).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/appointments", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { title, scheduled_at, duration_minutes, notes, appointment_type, clinic_id, doctor_id: bodyDoctorId } = req.body;
  if (!title || !scheduled_at) return res.status(400).json({ error: "title and scheduled_at required" });
  let patient_id: string;
  let doctor_id: string;
  if (bodyDoctorId) {
    const rec = await Patient.findOne({ patient_user_id: userId, doctor_id: String(bodyDoctorId) }).select("_id doctor_id").lean();
    if (!rec || (rec as any).doctor_id === userId) return res.status(403).json({ error: "Not linked to this doctor" });
    patient_id = (rec as any)._id?.toString();
    doctor_id = (rec as any).doctor_id;
  } else {
    const link = await getPatientForCurrentUser(req);
    if (!link) return res.status(404).json({ error: "Patient record not linked" });
    if (link.doctor_id === userId) return res.status(400).json({ error: "Connect with a doctor first. Select a doctor when booking." });
    patient_id = link.patient_id;
    doctor_id = link.doctor_id;
  }
  const scheduledAt = new Date(scheduled_at);
  if (isNaN(scheduledAt.getTime())) return res.status(400).json({ error: "Invalid scheduled_at" });
  const doc = await Appointment.create({
    patient_id,
    doctor_id,
    title: String(title).trim(),
    scheduled_at: scheduledAt,
    duration_minutes: duration_minutes != null ? Math.max(5, parseInt(String(duration_minutes), 10) || 30) : 30,
    notes: notes != null ? String(notes).trim() || null : null,
    appointment_type: appointment_type || "consultation",
    status: "requested",
    ...(clinic_id ? { clinic_id: String(clinic_id) } : {}),
  });
  // Email: appointment requested
  try {
    const authU = await AuthUser.findOne({ user_id: userId }).select("email full_name").lean();
    const dateStr = scheduledAt.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    if (authU && (authU as any).email) {
      sendAppointmentRequestedEmail((authU as any).email, (authU as any).full_name || "there", String(title).trim(), dateStr, userId).catch(() => {});
    }
    // Also notify the doctor
    const doctorAuth = await AuthUser.findOne({ user_id: doctor_id }).select("email full_name").lean();
    if (doctorAuth && (doctorAuth as any).email) {
      const patAuth = await AuthUser.findOne({ user_id: userId }).select("full_name").lean();
      const pName = (patAuth as any)?.full_name || "A patient";
      sendAppointmentRequestDoctorEmail((doctorAuth as any).email, (doctorAuth as any).full_name || "Doctor", pName, String(title).trim(), dateStr, doctor_id).catch(() => {});
    }
  } catch {}
  res.status(201).json({ ...doc.toJSON(), id: (doc as any)._id?.toString() });
});

// Patient: list my linked doctors (for scheduling and choosing who to book with)
router.get("/me/doctors", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  // Ensure every active PatientDoctorLink has a Patient record under that doctor (fixes links created before the fix)
  const links = await PatientDoctorLink.find({ patient_user_id: userId, status: "active" }).select("doctor_user_id").lean();
  for (const link of links as { doctor_user_id: string }[]) {
    const doctorId = link.doctor_user_id;
    const exists = await Patient.findOne({ patient_user_id: userId, doctor_id: doctorId }).select("_id").lean();
    if (!exists) {
      const profile = await Profile.findOne({ user_id: doctorId }).select("full_name").lean();
      const existingAny = await Patient.findOne({ patient_user_id: userId }).select("full_name phone").lean();
      await Patient.create({
        doctor_id: doctorId,
        patient_user_id: userId,
        full_name: (existingAny as any)?.full_name || (profile as any)?.full_name || "Patient",
        phone: (existingAny as any)?.phone || " ",
        status: "active",
      });
    }
  }
  const patients = await Patient.find({ patient_user_id: userId }).select("_id doctor_id").lean();
  const doctors = (patients as { _id: unknown; doctor_id: string }[]).filter((p) => p.doctor_id && p.doctor_id !== userId);
  if (doctors.length === 0) return res.json([]);
  const uniqueDoctorIds = [...new Set(doctors.map((d) => d.doctor_id))];
  const profiles = await Profile.find({ user_id: { $in: uniqueDoctorIds } }).select("user_id full_name").lean();
  const nameByDoctorId: Record<string, string> = {};
  for (const p of profiles as { user_id: string; full_name?: string }[]) nameByDoctorId[p.user_id] = p.full_name || "Doctor";
  const list = doctors.map((d) => ({
    doctor_id: d.doctor_id,
    doctor_name: nameByDoctorId[d.doctor_id] || "Doctor",
    patient_id: (d as any)._id?.toString(),
  }));
  const seen = new Set<string>();
  const deduped = list.filter((x) => {
    if (seen.has(x.doctor_id)) return false;
    seen.add(x.doctor_id);
    return true;
  });
  res.json(deduped);
});

// Patient: get free appointment slots for my doctor on a given date (based on doctor availability minus booked appointments)
router.get("/me/available_slots", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { date?: string; doctor_id?: string };
  const dateStr = q.date || "";
  const requestedDoctorId = q.doctor_id ? String(q.doctor_id) : null;

  let link: { patient_id: string; doctor_id: string } | null;
  if (requestedDoctorId) {
    const rec = await Patient.findOne({ patient_user_id: userId, doctor_id: requestedDoctorId }).select("_id doctor_id").lean();
    if (!rec || (rec as any).doctor_id === userId) {
      return res.status(403).json({ error: "Not linked to this doctor" });
    }
    link = { patient_id: (rec as any)._id?.toString(), doctor_id: (rec as any).doctor_id };
  } else {
    link = await getPatientForCurrentUser(req);
    if (!link) return res.status(404).json({ error: "Patient record not linked", reason: "connect_required" });
    if (link.doctor_id === userId) {
      return res.status(200).json({ date: dateStr, slots: [], reason: "connect_required" });
    }
    const allDoctors = await Patient.find({ patient_user_id: userId, doctor_id: { $ne: userId } }).select("doctor_id").lean();
    if (allDoctors.length > 1 && !requestedDoctorId) {
      return res.status(400).json({ error: "You have multiple doctors. Pass doctor_id to see availability for a specific doctor." });
    }
  }

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return res.status(400).json({ error: "Query date required (YYYY-MM-DD)" });
  const day = new Date(dateStr + "T12:00:00.000Z");
  if (isNaN(day.getTime())) return res.status(400).json({ error: "Invalid date" });
  const dayOfWeek = day.getUTCDay();
  const availabilities = await DoctorAvailability.find({
    doctor_id: link!.doctor_id,
    day_of_week: dayOfWeek,
    is_active: true,
  }).lean();
  const slots: { start: string; end: string; scheduled_at: string }[] = [];
  const toMins = (t: string) => {
    const [h, m] = (t || "0:0").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const defaultSlotDuration = 30;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const isSelectedToday = dateStr === todayStr;
  for (const av of availabilities as { start_time: string; end_time: string; slot_duration_minutes?: number }[]) {
    const step = av.slot_duration_minutes || 15;
    let mins = toMins(av.start_time);
    const endMins = toMins(av.end_time);
    while (mins + defaultSlotDuration <= endMins) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const scheduledAt = new Date(`${dateStr}T${startTime}:00`);
      const isPast = isSelectedToday && scheduledAt < now;
      if (!isPast) {
        const endM = mins + defaultSlotDuration;
        const endTime = `${String(Math.floor(endM / 60)).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;
        slots.push({
          start: startTime,
          end: endTime,
          scheduled_at: scheduledAt.toISOString(),
        });
      }
      mins += step;
    }
  }
  slots.sort((a, b) => a.start.localeCompare(b.start));
  const existing = await Appointment.find({
    doctor_id: link.doctor_id,
    status: "scheduled",
    scheduled_at: {
      $gte: new Date(`${dateStr}T00:00:00`),
      $lt: new Date(`${dateStr}T23:59:59.999`),
    },
  })
    .select("scheduled_at duration_minutes")
    .lean();
  const slotDurationMs = defaultSlotDuration * 60 * 1000;
  const freeSlots = slots.filter((slot) => {
    const slotStart = new Date(slot.scheduled_at).getTime();
    const slotEnd = slotStart + slotDurationMs;
    for (const ex of existing as { scheduled_at: Date; duration_minutes?: number }[]) {
      const exStart = new Date(ex.scheduled_at).getTime();
      const exEnd = exStart + (ex.duration_minutes || 30) * 60 * 1000;
      if (exStart < slotEnd && exEnd > slotStart) return false;
    }
    return true;
  });
  const reason = availabilities.length === 0 ? "no_availability_for_day" : undefined;
  res.json({ date: dateStr, slots: freeSlots, ...(reason ? { reason } : {}) });
});

router.get("/me/vitals", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await Vital.find(filter).sort({ recorded_at: -1 }).limit(50).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/me/lab_results", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await LabResult.find(filter).sort({ tested_at: -1 }).limit(50).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/lab_results/upload-report", requireAuth, upload.single("file"), async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "Lab report AI is not configured (GEMINI_API_KEY)" });
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "file required" });
  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) return res.status(400).json({ error: "Only image (JPEG, PNG, WebP) or PDF files are supported" });
  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const extracted = isPdf
      ? await extractLabResultsFromPdf(GEMINI_API_KEY, buf, file.originalname || file.filename)
      : await extractLabResultsFromImage(GEMINI_API_KEY, buf.toString("base64"), mime);
    if (!extracted.results?.length) return res.status(422).json({ error: "No lab values could be read from the file. Try a clearer image or PDF." });
    const analysis = await analyzeLabResultsForReport(GEMINI_API_KEY, extracted.results);
    const testedAt = extracted.tested_at ? new Date(extracted.tested_at) : new Date();
    const reportDoc = await LabReport.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      uploaded_by: (req as AuthRequest).user.id,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_type: mime,
      tested_at: testedAt,
      ai_summary: analysis.ai_summary || null,
      layman_summary: analysis.layman_summary || null,
      extracted_data: (analysis.key_points?.length || analysis.charts?.length) ? { key_points: analysis.key_points, charts: analysis.charts } : null,
    });
    const reportId = reportDoc._id;
    const resultsToCreate = extracted.results.map((r: { test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }) => ({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      lab_report_id: reportId,
      test_name: String(r.test_name || "").trim() || "Unknown",
      result_value: String(r.result_value || "").trim(),
      unit: r.unit ? String(r.unit).trim() : null,
      reference_range: r.reference_range ? String(r.reference_range).trim() : null,
      status: r.status === "critical" ? "critical" : r.status === "abnormal" ? "abnormal" : "normal",
      tested_at: testedAt,
    }));
    const created = await LabResult.insertMany(resultsToCreate);
    const reportOut = { ...reportDoc.toObject(), id: reportDoc._id?.toString(), _id: undefined, __v: undefined };
    const resultsOut = created.map((d: any) => ({ ...d.toObject(), id: d._id?.toString(), _id: undefined, __v: undefined, lab_report_id: reportId?.toString() }));
    return res.status(201).json({ report: reportOut, results: resultsOut });
  } catch (e) {
    const err = e as Error;
    return res.status(500).json({ error: err.message || "Lab report processing failed" });
  }
});

router.post("/me/lab_results", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const body = { ...req.body, patient_id: link.patient_id, doctor_id: link.doctor_id };
  if (!body.tested_at) body.tested_at = new Date();
  const doc = await LabResult.create(body);
  res.status(201).json(doc.toJSON());
});

router.get("/me/lab_reports", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await LabReport.find(filter).sort({ tested_at: -1 }).limit(50).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/me/lab_reports/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const report = await LabReport.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ error: "Not found" });
  const r = report as any;
  const patientOk = link.patient_ids.length > 1 ? link.patient_ids.includes(r.patient_id) : r.patient_id === link.patient_id;
  if (!patientOk) return res.status(404).json({ error: "Not found" });
  const results = await LabResult.find({ lab_report_id: r._id }).sort({ test_name: 1 }).lean();
  res.json({
    report: { ...r, id: r._id?.toString(), _id: undefined, __v: undefined },
    results: results.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })),
  });
});

router.get("/me/patient_documents", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await PatientDocument.find(filter).sort({ created_at: -1 }).limit(LIMITS.ME_DOCUMENTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/me/patient_documents/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const doc = await PatientDocument.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  const d = doc as any;
  const ok = link.patient_ids.length > 1 ? link.patient_ids.includes(d.patient_id) : d.patient_id === link.patient_id;
  if (!ok) return res.status(404).json({ error: "Not found" });
  res.json({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined });
});

router.post("/me/patient_documents/upload-and-analyze", requireAuth, upload.single("file"), async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "Document analysis is not configured (GEMINI_API_KEY)" });
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const file = (req as any).file;
  const { category, notes } = req.body;
  if (!file) return res.status(400).json({ error: "file required" });
  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) return res.status(400).json({ error: "Only image (JPEG, PNG, WebP) or PDF are supported" });
  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const analysis = isPdf
      ? await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "pdf", buffer: buf, fileName: file.originalname || file.filename })
      : await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "image", base64: buf.toString("base64"), mimeType: mime });
    const extractedData: Record<string, unknown> = { key_points: analysis.key_points };
    if (analysis.chart_data) extractedData.chart_data = analysis.chart_data;
    if (analysis.prescription_summary) extractedData.prescription_summary = analysis.prescription_summary;
    if (analysis.medications?.length) extractedData.medications = analysis.medications;
    const doc = await PatientDocument.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      uploaded_by: (req as AuthRequest).user.id,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: category || "general",
      notes: notes || null,
      ai_summary: analysis.summary || null,
      layman_summary: analysis.layman_summary || null,
      extracted_data: extractedData,
      analyzed_at: new Date(),
    });
    res.status(201).json(doc.toJSON());
  } catch (e) {
    const doc = await PatientDocument.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      uploaded_by: (req as AuthRequest).user.id,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: category || "general",
      notes: notes || null,
    });
    res.status(201).json(doc.toJSON());
  }
});

router.post("/me/patient_documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const file = (req as any).file;
  const { category, notes } = req.body;
  if (!file) return res.status(400).json({ error: "file required" });
  const doc = await PatientDocument.create({
    patient_id: link.patient_id,
    doctor_id: link.doctor_id,
    uploaded_by: (req as AuthRequest).user.id,
    file_name: file.originalname || file.filename,
    file_path: file.filename,
    file_size_bytes: file.size,
    file_type: file.mimetype,
    category: category || "general",
    notes: notes || null,
  });
  res.status(201).json(doc.toJSON());
});

router.get("/me/link_requests", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const list = await LinkRequest.find({ patient_user_id: userId }).sort({ created_at: -1 }).limit(5).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/link_requests", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { doctor_code, message } = req.body;
  const profile = await Profile.findOne({ doctor_code: (doctor_code as string)?.toUpperCase() }).select("user_id full_name").lean();
  if (!profile) return res.status(404).json({ error: "Doctor not found" });
  const myProfile = await Profile.findOne({ user_id: userId }).select("full_name").lean();
  await LinkRequest.create({
    patient_user_id: userId,
    patient_name: (myProfile as any)?.full_name || "Patient",
    doctor_id: (profile as any).user_id,
    message: message || null,
    status: "pending",
  });
  res.status(201).json({ ok: true });
});

/** Quick-connect: patient scans QR, confirms, gets linked to doctor instantly */
router.post("/me/connect-doctor", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { doctor_code } = req.body;
  if (!doctor_code) return res.status(400).json({ error: "doctor_code is required" });

  const doctorProfile = await Profile.findOne({ doctor_code: (doctor_code as string).toUpperCase() }).select("user_id full_name").lean();
  if (!doctorProfile) return res.status(404).json({ error: "Doctor not found" });
  const doctorUserId = (doctorProfile as any).user_id;

  // Prevent self-link
  if (doctorUserId === userId) return res.status(400).json({ error: "Cannot connect to yourself" });

  // Check existing active link
  const existingLink = await PatientDoctorLink.findOne({
    patient_user_id: userId, doctor_user_id: doctorUserId, status: "active",
  }).lean();
  if (existingLink) return res.json({ already_connected: true, message: "You are already connected to this doctor" });

  // Create active link immediately (QR scan is pre-approved)
  await PatientDoctorLink.create({
    patient_user_id: userId,
    doctor_user_id: doctorUserId,
    doctor_name: (doctorProfile as any).full_name || "Doctor",
    status: "active",
    responded_at: new Date(),
  });

  // Ensure patient record exists under this doctor
  const myProfile = await Profile.findOne({ user_id: userId }).select("full_name phone").lean();
  const existingPatient = await Patient.findOne({ patient_user_id: userId, doctor_id: doctorUserId }).lean();
  if (!existingPatient) {
    await Patient.create({
      patient_user_id: userId,
      doctor_id: doctorUserId,
      full_name: (myProfile as any)?.full_name || "Patient",
      phone: (myProfile as any)?.phone || " ",
      status: "active",
    });
  }

  // Notify doctor
  await Notification.create({
    user_id: doctorUserId,
    title: `New patient connected: ${(myProfile as any)?.full_name || "A patient"}`,
    message: `${(myProfile as any)?.full_name || "A patient"} connected via QR code scan.`,
    type: "success",
    category: "link",
  });

  res.status(201).json({ connected: true, doctor_name: (doctorProfile as any).full_name });
});

router.get("/me/patient", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ patient_user_id: userId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient record not linked" });
  res.json({ ...patient, id: (patient as any)._id?.toString(), _id: undefined, __v: undefined });
});

router.patch("/me/patient", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const updated = await Patient.findOneAndUpdate(
    { patient_user_id: userId },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Patient record not linked" });
  res.json({ ...updated, id: (updated as any)._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Patient self-service: log own vitals / meals (patient_user_id = user.id) ----------
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
  // Prefer the doctor from an active PatientDoctorLink (the doctor the patient actually connected with)
  const activeLink = await PatientDoctorLink.findOne({ patient_user_id: userId, status: "active" })
    .select("doctor_user_id")
    .sort({ responded_at: -1, createdAt: -1 })
    .lean();
  if (activeLink) {
    const docId = (activeLink as { doctor_user_id: string }).doctor_user_id;
    const linkedPatient = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id === docId);
    if (linkedPatient) {
      return { patient_id: linkedPatient._id?.toString() as string, doctor_id: docId, patient_ids };
    }
  }
  // Prefer a Patient record linked to a real doctor (doctor_id !== userId) over the self-created placeholder
  const underDoctor = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id && p.doctor_id !== userId);
  if (underDoctor) {
    return { patient_id: underDoctor._id?.toString() as string, doctor_id: underDoctor.doctor_id, patient_ids };
  }
  const first = patients[0] as { _id: unknown; doctor_id: string };
  return { patient_id: first._id?.toString() as string, doctor_id: first.doctor_id, patient_ids };
}

router.post("/me/vitals/bulk", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const vitalsList = req.body?.vitals;
  if (!Array.isArray(vitalsList) || vitalsList.length === 0) {
    return res.status(400).json({ error: "vitals array required and must be non-empty" });
  }
  const valid: Array<Record<string, unknown>> = [];
  for (const v of vitalsList) {
    const vital_type = v.vital_type != null ? String(v.vital_type) : "";
    const value_text = v.value_text != null ? String(v.value_text).trim() : "";
    if (!vital_type || !value_text) continue;
    valid.push({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      vital_type,
      value_text,
      value_numeric: v.value_numeric != null && Number.isFinite(Number(v.value_numeric)) ? Number(v.value_numeric) : null,
      unit: v.unit != null ? String(v.unit).trim() || null : null,
      notes: v.notes != null ? String(v.notes).trim() || null : null,
      recorded_at: v.recorded_at ? new Date(v.recorded_at as string) : undefined,
    });
  }
  if (valid.length === 0) return res.status(400).json({ error: "No valid vitals (need vital_type and value_text per row)" });
  const created = await Vital.insertMany(valid);
  const hasBp = valid.some((v) => v.vital_type === "blood_pressure");
  const hasSugar = valid.some((v) => v.vital_type === "blood_sugar");
  if (hasBp) await resolveReminderEscalation(link.patient_id, "blood_pressure");
  if (hasSugar) await resolveReminderEscalation(link.patient_id, "blood_sugar");
  const points_earned = (hasBp ? POINTS.blood_pressure : 0) + (hasSugar ? POINTS.blood_sugar : 0);
  const filterBulk: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filterBulk);
  if (hasBp) await updateGamificationState(link.patient_id, "blood_pressure", filterBulk);
  if (hasSugar) await updateGamificationState(link.patient_id, "blood_sugar", filterBulk);
  return res.status(201).json({ created: created.length, ids: created.map((d: any) => d._id?.toString()), points_earned, ...rewards });
});

router.post("/me/vitals", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const body = {
    ...req.body,
    patient_id: link.patient_id,
    doctor_id: link.doctor_id,
  };
  if (!body.notes || String(body.notes).trim() === "") {
    const remark = await getAiVitalRemark(body.vital_type, body.value_text, body.unit);
    if (remark) body.notes = remark;
  }
  const doc = await Vital.create(body);
  const vitalType = (body.vital_type as string) === "blood_pressure" || (body.vital_type as string) === "blood_sugar" ? (body.vital_type as "blood_pressure" | "blood_sugar") : null;
  if (vitalType) await resolveReminderEscalation(link.patient_id, vitalType);
  const points_earned = vitalType ? POINTS[vitalType] : 0;
  const filterVital: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewardsVital = await getRewardsForFilter(filterVital);
  if (vitalType) await updateGamificationState(link.patient_id, vitalType, filterVital);
  res.status(201).json({ ...doc.toJSON(), points_earned, ...rewardsVital });

  // Email notifications (fire-and-forget)
  try {
    const userId = (req as AuthRequest).user.id;
    const authU = await AuthUser.findOne({ user_id: userId }).select("email").lean();
    const prof = await Profile.findOne({ user_id: userId }).select("full_name").lean();
    if (authU && (authU as any).email) {
      const vLabel = body.vital_type === "blood_pressure" ? "Blood Pressure" : body.vital_type === "blood_sugar" ? "Blood Sugar" : String(body.vital_type);
      sendVitalsLoggedEmail((authU as any).email, (prof as any)?.full_name || "there", vLabel, body.value_text || "", userId).catch(() => {});
      // Alert doctor if critical values
      if (body.vital_type === "blood_pressure") {
        const sys = parseInt(body.value_text);
        if (sys > 180 || sys < 90) {
          const patient = await Patient.findById(link.patient_id).select("full_name doctor_id").lean();
          if (patient) {
            const docProf = await Profile.findOne({ user_id: (patient as any).doctor_id }).select("full_name").lean();
            const docAuth = await AuthUser.findOne({ user_id: (patient as any).doctor_id }).select("email").lean();
            if (docAuth && (docAuth as any).email) {
              sendCriticalVitalsAlertEmail((docAuth as any).email, (docProf as any)?.full_name || "Doctor", (patient as any).full_name || "Patient", "Blood Pressure", body.value_text, (patient as any).doctor_id).catch(() => {});
            }
          }
        }
      }
      if (body.vital_type === "blood_sugar") {
        const val = parseInt(body.value_text);
        if (val > 300 || val < 60) {
          const patient = await Patient.findById(link.patient_id).select("full_name doctor_id").lean();
          if (patient) {
            const docProf = await Profile.findOne({ user_id: (patient as any).doctor_id }).select("full_name").lean();
            const docAuth = await AuthUser.findOne({ user_id: (patient as any).doctor_id }).select("email").lean();
            if (docAuth && (docAuth as any).email) {
              sendCriticalVitalsAlertEmail((docAuth as any).email, (docProf as any)?.full_name || "Doctor", (patient as any).full_name || "Patient", "Blood Sugar", body.value_text, (patient as any).doctor_id).catch(() => {});
            }
          }
        }
      }
    }
  } catch {}
});

router.patch("/me/vitals/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids }, _id: req.params.id } : { patient_id: link.patient_id, _id: req.params.id };
  const updated = await Vital.findOneAndUpdate(filter, { $set: req.body }, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

router.delete("/me/vitals/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids }, _id: req.params.id } : { patient_id: link.patient_id, _id: req.params.id };
  const deleted = await Vital.findOneAndDelete(filter);
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// ---------- Instant rewards (points, health score, today progress) ----------
const POINTS = { blood_pressure: 10, blood_sugar: 10, food: 5, medication: 5 } as const;
const HEALTH_SCORE_PER_ITEM = 25; // 4 items × 25 = 100

type RewardsFilter = { patient_id: string } | { patient_id: { $in: string[] } };
async function getRewardsForFilter(filter: RewardsFilter): Promise<{
  total_points: number;
  health_score: number;
  today_progress: { bp: boolean; food: boolean; sugar: boolean; medication: boolean };
  points_breakdown: { blood_pressure: number; blood_sugar: number; food: number; medication: number };
}> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const [bpCount, sugarCount, foodCount, medCount, bpToday, sugarToday, foodToday, medToday] = await Promise.all([
    Vital.countDocuments({ ...filter, vital_type: "blood_pressure" }),
    Vital.countDocuments({ ...filter, vital_type: "blood_sugar" }),
    FoodLog.countDocuments(filter),
    MedicationLog.countDocuments(filter),
    Vital.exists({ ...filter, vital_type: "blood_pressure", recorded_at: { $gte: startOfToday } }),
    Vital.exists({ ...filter, vital_type: "blood_sugar", recorded_at: { $gte: startOfToday } }),
    FoodLog.exists({ ...filter, logged_at: { $gte: startOfToday } }),
    MedicationLog.exists({ ...filter, logged_at: { $gte: startOfToday } }),
  ]);
  const points_breakdown = {
    blood_pressure: bpCount * POINTS.blood_pressure,
    blood_sugar: sugarCount * POINTS.blood_sugar,
    food: foodCount * POINTS.food,
    medication: medCount * POINTS.medication,
  };
  let total_points = points_breakdown.blood_pressure + points_breakdown.blood_sugar + points_breakdown.food + points_breakdown.medication;
  try {
    const gam = await PatientGamification.findOne(filter).select("total_points").lean();
    if (gam && typeof (gam as any).total_points === "number") {
      total_points = (gam as any).total_points;
    }
  } catch (err) {
    console.error("Error fetching gamification total_points:", err);
  }
  const health_score =
    (!!bpToday ? HEALTH_SCORE_PER_ITEM : 0) +
    (!!sugarToday ? HEALTH_SCORE_PER_ITEM : 0) +
    (!!foodToday ? HEALTH_SCORE_PER_ITEM : 0) +
    (!!medToday ? HEALTH_SCORE_PER_ITEM : 0);
  return {
    total_points,
    health_score,
    today_progress: { bp: !!bpToday, food: !!foodToday, sugar: !!sugarToday, medication: !!medToday },
    points_breakdown,
  };
}

// ---------- Gamification: streak, badges, levels, weekly challenges ----------
function getWeekStart(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const day = x.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = start
  x.setUTCDate(x.getUTCDate() + diff);
  return x;
}

async function getDistinctLogDates(filter: RewardsFilter): Promise<string[]> {
  const dateProject = { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } };
  const [vitalDates, foodDates, medDates] = await Promise.all([
    Vital.aggregate<{ _id: string }>([{ $match: { ...filter } }, { $group: { _id: dateProject } }]).exec(),
    FoodLog.aggregate<{ _id: string }>([{ $match: { ...filter } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } }]).exec(),
    MedicationLog.aggregate<{ _id: string }>([{ $match: { ...filter } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } }]).exec(),
  ]);
  const set = new Set<string>();
  for (const r of vitalDates) set.add(r._id);
  for (const r of foodDates) set.add(r._id);
  for (const r of medDates) set.add(r._id);
  return [...set].sort();
}

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const set = new Set(dates);
  if (!set.has(todayStr)) return 0;
  let streak = 0;
  const d = new Date(todayStr);
  while (true) {
    const s = d.toISOString().slice(0, 10);
    if (!set.has(s)) break;
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}

const BADGE_DEFINITIONS: { key: string; title: string; requirement: number; type: "bp_days" | "sugar_days" | "food_days" | "med_days" }[] = [
  { key: "bp_30_days", title: "Heart Guardian", requirement: 30, type: "bp_days" },
  { key: "sugar_30_days", title: "Sugar Sentinel", requirement: 30, type: "sugar_days" },
  { key: "food_14_days", title: "Nutrition Navigator", requirement: 14, type: "food_days" },
  { key: "med_30_days", title: "Medication Master", requirement: 30, type: "med_days" },
];

const LEVELS: { min_points: number; label: string }[] = [
  { min_points: 0, label: "Beginner" },
  { min_points: 100, label: "Consistent" },
  { min_points: 500, label: "Health Champion" },
];

const WEEKLY_CHALLENGES: { key: string; title: string; target_days: number; reward_points: number; type: "bp_days" | "sugar_days" | "food_days" | "med_days" }[] = [
  { key: "bp_7_days", title: "Log BP 7 days this week", target_days: 7, reward_points: 50, type: "bp_days" },
  { key: "sugar_5_days", title: "Log blood sugar 5 days this week", target_days: 5, reward_points: 40, type: "sugar_days" },
  { key: "food_7_days", title: "Log food 7 days this week", target_days: 7, reward_points: 35, type: "food_days" },
  { key: "med_7_days", title: "Log medication 7 days this week", target_days: 7, reward_points: 50, type: "med_days" },
];

// Layer 7: Milestone rewards — tangible real-world benefits
const MILESTONE_DEFINITIONS: { key: string; title: string; description: string; required_points: number; icon: string }[] = [
  { key: "bronze", title: "Bronze Tier", description: "Free lab test at partner clinic | 10% off next program plan", required_points: 1200, icon: "stethoscope" },
  { key: "silver", title: "Silver Tier", description: "Free HbA1c test | 1 complimentary teleconsultation with the treating physician", required_points: 3000, icon: "pill" },
  { key: "gold", title: "Gold Tier", description: "90-day Chronic Care Plan at 50% off | Mediimate Premium badge | Priority physician access", required_points: 5000, icon: "heart-pulse" },
];

/**
 * Update the persisted gamification state for a patient after a log action.
 * Call this after every BP, sugar, food, or medication log.
 */
async function updateGamificationState(
  patientId: string,
  logType: "blood_pressure" | "blood_sugar" | "food" | "medication",
  filter: RewardsFilter
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const pointsForLog = logType === "blood_pressure" ? POINTS.blood_pressure
    : logType === "blood_sugar" ? POINTS.blood_sugar
    : logType === "food" ? POINTS.food
    : POINTS.medication;

  const pointsField = logType === "blood_pressure" ? "points_bp"
    : logType === "blood_sugar" ? "points_sugar"
    : logType === "food" ? "points_food"
    : "points_medication";

  const countField = logType === "blood_pressure" ? "bp_logs"
    : logType === "blood_sugar" ? "sugar_logs"
    : logType === "food" ? "food_logs"
    : "medication_logs";

  // Upsert the gamification doc
  let gam = await PatientGamification.findOne({ patient_id: patientId });
  if (!gam) {
    // First-time: bootstrap from actual DB counts
    const [bpC, sugarC, foodC, medC] = await Promise.all([
      Vital.countDocuments({ ...filter, vital_type: "blood_pressure" }),
      Vital.countDocuments({ ...filter, vital_type: "blood_sugar" }),
      FoodLog.countDocuments(filter),
      MedicationLog.countDocuments(filter),
    ]);
    const dates = await getDistinctLogDates(filter);
    const streak = computeStreak(dates);
    const tp = bpC * POINTS.blood_pressure + sugarC * POINTS.blood_sugar + foodC * POINTS.food + medC * POINTS.medication;
    let lv = 1; let ll = LEVELS[0].label;
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (tp >= LEVELS[i].min_points) { lv = i + 1; ll = LEVELS[i].label; break; }
    }
    gam = await PatientGamification.create({
      patient_id: patientId,
      current_streak: streak, longest_streak: streak, last_log_date: today,
      total_points: tp, points_bp: bpC * POINTS.blood_pressure, points_sugar: sugarC * POINTS.blood_sugar,
      points_food: foodC * POINTS.food, points_medication: medC * POINTS.medication,
      level: lv, level_label: ll,
      total_logs: bpC + sugarC + foodC + medC,
      bp_logs: bpC, sugar_logs: sugarC, food_logs: foodC, medication_logs: medC,
    });
    return;
  }

  // Increment points & counts
  const g = gam as any;
  g[pointsField] = (g[pointsField] || 0) + pointsForLog;
  g.total_points = (g.total_points || 0) + pointsForLog;
  g[countField] = (g[countField] || 0) + 1;
  g.total_logs = (g.total_logs || 0) + 1;

  // Update streak
  const lastDate = g.last_log_date;
  if (lastDate !== today) {
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    if (lastDate === yesterdayStr) {
      g.current_streak = (g.current_streak || 0) + 1;
    } else if (!lastDate || lastDate < yesterdayStr) {
      g.current_streak = 1;
    }
    g.last_log_date = today;

    // Streak bonus points
    if (g.current_streak === 3) {
      g.total_points = (g.total_points || 0) + 25;
    } else if (g.current_streak === 7) {
      g.total_points = (g.total_points || 0) + 75;
    }
  }
  if (g.current_streak > (g.longest_streak || 0)) {
    g.longest_streak = g.current_streak;
  }

  // Email: streak milestone (7, 14, 21, 30, 60, 90, 180, 365)
  const streakMilestones = [7, 14, 21, 30, 60, 90, 180, 365];
  if (streakMilestones.includes(g.current_streak)) {
    try {
      const patient = await Patient.findById(patientId).select("patient_user_id full_name").lean();
      const uid = (patient as any)?.patient_user_id;
      if (uid) {
        const authU = await AuthUser.findOne({ user_id: uid }).select("email full_name").lean();
        if (authU && (authU as any).email) {
          sendStreakMilestoneEmail((authU as any).email, (authU as any).full_name || (patient as any)?.full_name || "there", g.current_streak, uid).catch(() => {});
        }
      }
    } catch {}
  }

  // Update level
  const prevLevel = g.level || 1;
  let lv = 1; let ll = LEVELS[0].label;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (g.total_points >= LEVELS[i].min_points) { lv = i + 1; ll = LEVELS[i].label; break; }
  }
  g.level = lv;
  g.level_label = ll;

  await gam.save();
}

async function getDaysCountByType(filter: RewardsFilter): Promise<{ bp_days: number; sugar_days: number; food_days: number; med_days: number }> {
  const [bp, sugar, food, med] = await Promise.all([
    Vital.aggregate<{ _id: string }>([{ $match: { ...filter, vital_type: "blood_pressure" } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } } } }]).exec(),
    Vital.aggregate<{ _id: string }>([{ $match: { ...filter, vital_type: "blood_sugar" } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } } } }]).exec(),
    FoodLog.aggregate<{ _id: string }>([{ $match: filter }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } }]).exec(),
    MedicationLog.aggregate<{ _id: string }>([{ $match: filter }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } }]).exec(),
  ]);
  return { bp_days: bp.length, sugar_days: sugar.length, food_days: food.length, med_days: med.length };
}

async function getDaysThisWeekByType(filter: RewardsFilter, weekStart: Date): Promise<{ bp_days: number; sugar_days: number; food_days: number; med_days: number }> {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const [bp, sugar, food, med] = await Promise.all([
    Vital.aggregate<{ _id: string }>([
      { $match: { ...filter, vital_type: "blood_pressure", recorded_at: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } } } },
    ]).exec(),
    Vital.aggregate<{ _id: string }>([
      { $match: { ...filter, vital_type: "blood_sugar", recorded_at: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$recorded_at" } } } },
    ]).exec(),
    FoodLog.aggregate<{ _id: string }>([
      { $match: { ...filter, logged_at: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } },
    ]).exec(),
    MedicationLog.aggregate<{ _id: string }>([
      { $match: { ...filter, logged_at: { $gte: weekStart, $lt: weekEnd } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$logged_at" } } } },
    ]).exec(),
  ]);
  return { bp_days: bp.length, sugar_days: sugar.length, food_days: food.length, med_days: med.length };
}

router.get("/me/gamification", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const patientId = link.patient_id;

  const [rewards, dates, daysByType, earnedBadgesList, bpCount, sugarCount, foodCount, medCount] = await Promise.all([
    getRewardsForFilter(filter),
    getDistinctLogDates(filter),
    getDaysCountByType(filter),
    UserBadge.find({ patient_id: patientId }).sort({ earned_at: -1 }).lean(),
    Vital.countDocuments({ ...filter, vital_type: "blood_pressure" }),
    Vital.countDocuments({ ...filter, vital_type: "blood_sugar" }),
    FoodLog.countDocuments(filter),
    MedicationLog.countDocuments(filter),
  ]);

  const streak_days = computeStreak(dates);

  const badges: { key: string; title: string; earned_at?: string }[] = [];
  for (const b of earnedBadgesList) {
    const def = BADGE_DEFINITIONS.find((d) => d.key === (b as any).badge_key);
    badges.push({ key: (b as any).badge_key, title: def?.title ?? (b as any).badge_key, earned_at: (b as any).earned_at?.toISOString?.() ?? undefined });
  }
  const newlyEarnedBadges: { key: string; title: string }[] = [];
  for (const def of BADGE_DEFINITIONS) {
    const count = daysByType[def.type];
    if (count >= def.requirement && !earnedBadgesList.some((e: any) => e.badge_key === def.key)) {
      await UserBadge.create({ patient_id: patientId, badge_key: def.key });
      badges.push({ key: def.key, title: def.title, earned_at: new Date().toISOString() });
      newlyEarnedBadges.push({ key: def.key, title: def.title });
    }
  }
  // Email: badge earned notifications
  if (newlyEarnedBadges.length > 0) {
    try {
      const patientRec = await Patient.findById(patientId).select("patient_user_id full_name").lean();
      const uid = (patientRec as any)?.patient_user_id;
      if (uid) {
        const authU = await AuthUser.findOne({ user_id: uid }).select("email full_name").lean();
        if (authU && (authU as any).email) {
          for (const b of newlyEarnedBadges) {
            const bDef = BADGE_DEFINITIONS.find((d) => d.key === b.key);
            sendBadgeEarnedEmail((authU as any).email, (authU as any).full_name || "there", b.title, bDef ? `Log ${bDef.requirement}+ days of ${bDef.type.replace("_", " ")}` : "Keep it up!", uid).catch(() => {});
          }
        }
      }
    } catch {}
  }
  badges.sort((a, b) => (b.earned_at ?? "").localeCompare(a.earned_at ?? ""));

  let level = 1;
  let level_label = LEVELS[0].label;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (rewards.total_points >= LEVELS[i].min_points) {
      level = i + 1;
      level_label = LEVELS[i].label;
      break;
    }
  }

  const weekStart = getWeekStart(new Date());
  const [daysThisWeek, existingWeekly] = await Promise.all([
    getDaysThisWeekByType(filter, weekStart),
    UserWeeklyChallenge.find({ patient_id: patientId, week_start: weekStart }).lean(),
  ]);

  const weekly_challenges: { id: string; title: string; target_days: number; current_days: number; reward_points: number; completed: boolean; completed_at?: string }[] = [];
  for (const ch of WEEKLY_CHALLENGES) {
    const current_days = daysThisWeek[ch.type];
    const existing = existingWeekly.find((e: any) => e.challenge_key === ch.key);
    const completed = existing != null || current_days >= ch.target_days;
    let completed_at: string | undefined = (existing as any)?.completed_at?.toISOString?.();
    if (current_days >= ch.target_days && !existing) {
      try {
        const created = await UserWeeklyChallenge.create({
          patient_id: patientId,
          challenge_key: ch.key,
          week_start: weekStart,
          reward_points_awarded: ch.reward_points,
          completed_at: new Date(),
        });
        completed_at = (created as any).completed_at?.toISOString?.();
        // Award challenge points
        const gamDoc = await PatientGamification.findOne({ patient_id: patientId });
        if (gamDoc) {
          gamDoc.total_points = (gamDoc.total_points || 0) + ch.reward_points;
          await gamDoc.save();
        }
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
        completed_at = new Date().toISOString();
      }
    }
    weekly_challenges.push({
      id: ch.key,
      title: ch.title,
      target_days: ch.target_days,
      current_days,
      reward_points: ch.reward_points,
      completed: !!existing || current_days >= ch.target_days,
      completed_at,
    });
  }

  // --- Layer 7: Milestone rewards (real-world benefits) ---
  const currentPoints = rewards.total_points;
  const existingMilestones = await MilestoneReward.find({ patient_id: patientId }).lean();

  const milestoneResults: { key: string; title: string; description: string; required_points: number; current_points: number; unlocked: boolean; unlocked_at?: string; claimed: boolean; claimed_at?: string; coupon_code?: string; icon: string }[] = [];
  for (const m of MILESTONE_DEFINITIONS) {
    const existing = existingMilestones.find((e: any) => e.milestone_key === m.key);
    const unlocked = existing != null || currentPoints >= m.required_points;
    if (currentPoints >= m.required_points && !existing) {
      try {
        await MilestoneReward.create({ patient_id: patientId, milestone_key: m.key });
      } catch (err: any) {
        if (err?.code !== 11000) throw err;
      }
    }
    const doc = existing || (unlocked ? await MilestoneReward.findOne({ patient_id: patientId, milestone_key: m.key }).lean() : null);
    milestoneResults.push({
      key: m.key,
      title: m.title,
      description: m.description,
      required_points: m.required_points,
      current_points: currentPoints,
      unlocked,
      unlocked_at: (doc as any)?.unlocked_at?.toISOString?.() || (doc as any)?.created_at?.toISOString?.(),
      claimed: (doc as any)?.claimed ?? false,
      claimed_at: (doc as any)?.claimed_at?.toISOString?.(),
      coupon_code: (doc as any)?.coupon_code,
      icon: m.icon,
    });
  }

  // Persist gamification snapshot to DB
  const totalLogs = bpCount + sugarCount + foodCount + medCount;
  const gamUpdate = {
    current_streak: streak_days,
    last_log_date: dates.length > 0 ? dates[0] : undefined,
    points_bp: rewards.points_breakdown.blood_pressure,
    points_sugar: rewards.points_breakdown.blood_sugar,
    points_food: rewards.points_breakdown.food,
    points_medication: rewards.points_breakdown.medication,
    level,
    level_label,
    total_logs: totalLogs,
    bp_logs: bpCount,
    sugar_logs: sugarCount,
    food_logs: foodCount,
    medication_logs: medCount,
  };
  await PatientGamification.findOneAndUpdate(
    { patient_id: patientId },
    { $set: gamUpdate, $max: { longest_streak: streak_days } },
    { upsert: true, new: true }
  );

  const gamDoc = await PatientGamification.findOne({ patient_id: patientId }).select("total_points").lean();
  const trueTotalPoints = gamDoc ? (gamDoc as any).total_points : rewards.total_points;

  res.json({
    streak_days,
    longest_streak: streak_days,
    badges,
    level,
    level_label,
    total_points: trueTotalPoints,
    points_breakdown: rewards.points_breakdown,
    weekly_challenges,
    milestones: milestoneResults,
    total_logs: totalLogs,
  });
});

// Layer 7: Claim a milestone reward
router.post("/me/milestones/:key/claim", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const patientId = link.patient_id;
  const key = req.params.key;

  const milestoneDef = MILESTONE_DEFINITIONS.find(m => m.key === key);
  if (!milestoneDef) return res.status(404).json({ error: "Milestone definition not found" });
  if (key === "gold") return res.status(400).json({ error: "Gold tier is disabled for the pilot" });

  const gam = await PatientGamification.findOne({ patient_id: patientId });
  const currentPoints = gam ? gam.total_points : 0;

  if (currentPoints < milestoneDef.required_points) {
    return res.status(400).json({ error: "Milestone not unlocked yet (insufficient points)" });
  }

  let milestone = await MilestoneReward.findOne({ patient_id: patientId, milestone_key: key });
  if (!milestone) {
    milestone = await MilestoneReward.create({ patient_id: patientId, milestone_key: key });
  }
  if ((milestone as any).claimed) return res.status(400).json({ error: "Already claimed" });
  
  const couponPrefix = key === "bronze" ? "BRONZE50-" : key === "silver" ? "SILVERFREE-" : "REWARD-";
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const couponCode = `${couponPrefix}${randomStr}`;

  (milestone as any).claimed = true;
  (milestone as any).claimed_at = new Date();
  (milestone as any).coupon_code = couponCode;
  await milestone.save();
  res.json({ success: true, claimed_at: (milestone as any).claimed_at.toISOString(), coupon_code: couponCode });
});

router.get("/me/rewards", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filter);
  res.json(rewards);
});

router.get("/me/quick-log/last", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const [lastBp, lastSugar, lastFood, lastMed] = await Promise.all([
    Vital.findOne({ ...filter, vital_type: "blood_pressure" }).sort({ recorded_at: -1 }).select("value_text recorded_at").lean(),
    Vital.findOne({ ...filter, vital_type: "blood_sugar" }).sort({ recorded_at: -1 }).select("value_text recorded_at").lean(),
    FoodLog.findOne(filter).sort({ logged_at: -1 }).select("meal_type logged_at").lean(),
    MedicationLog.findOne(filter).sort({ logged_at: -1 }).select("taken logged_at").lean(),
  ]);
  res.json({
    blood_pressure: lastBp ? { value_text: (lastBp as any).value_text, recorded_at: (lastBp as any).recorded_at } : null,
    blood_sugar: lastSugar ? { value_text: (lastSugar as any).value_text, recorded_at: (lastSugar as any).recorded_at } : null,
    food: lastFood ? { meal_type: (lastFood as any).meal_type, logged_at: (lastFood as any).logged_at } : null,
    medication: lastMed ? { taken: (lastMed as any).taken, logged_at: (lastMed as any).logged_at } : null,
  });
});

router.get("/me/food_logs", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await FoodLog.find(filter).sort({ logged_at: -1 }).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/food_logs", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });

  const geminiKey = process.env.GEMINI_API_KEY;
  const rawNotes: string = (req.body?.notes || "").trim();
  const imagePath: string | undefined = req.body?.image_path;
  const incomingItems: unknown[] = Array.isArray(req.body?.food_items) ? req.body.food_items : [];
  const mealType: string = req.body?.meal_type || "other";

  let food_items = incomingItems as { name: string; quantity?: number; unit?: string; calories?: number; protein?: number; carbs?: number; fat?: number }[];
  let total_calories: number | undefined;
  let total_protein: number | undefined;
  let total_carbs: number | undefined;
  let total_fat: number | undefined;

  // Run AI if: no food_items sent, OR food_items have no calorie data (e.g. just names from quick log)
  const incomingHasCalories = food_items.some((i) => (i.calories || 0) > 0);
  const needsAI = geminiKey && (food_items.length === 0 || !incomingHasCalories);

  // ── AI nutrition parsing ──────────────────────────────────────
  if (needsAI) {
    const systemPrompt = `You are a nutrition parser. Analyze the meal and extract food items with accurate nutritional values.
Return ONLY valid JSON: { "food_items": [{ "name": "string", "quantity": number, "unit": "string", "calories": number, "protein": number, "carbs": number, "fat": number }] }
For Indian foods use common serving sizes. Always return valid JSON only.`;

    // Build a description from incoming item names if notes aren't available
    const itemNamesText = food_items.map((i) => i.name).filter(Boolean).join(", ");
    const descriptionText = rawNotes || itemNamesText;

    try {
      // Case 1: image uploaded → read from disk and send to Gemini Vision
      if (imagePath) {
        const absPath = path.join(UPLOAD_DIR, imagePath);
        if (fs.existsSync(absPath)) {
          const buf = fs.readFileSync(absPath);
          const mime = imagePath.match(/\.(png)$/i) ? "image/png" : imagePath.match(/\.(webp)$/i) ? "image/webp" : "image/jpeg";
          const imageBase64 = buf.toString("base64");
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: "user", parts: [
                  { text: `Meal type: ${mealType}${descriptionText ? `\nDescription: ${descriptionText}` : ""}. Analyze this meal image.` },
                  { inlineData: { mimeType: mime, data: imageBase64 } },
                ]}],
                generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
              }),
            }
          );
          if (geminiRes.ok) {
            const aiResult = await geminiRes.json();
            const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
            try {
              const parsed = JSON.parse(jsonMatch[1]!.trim());
              if (Array.isArray(parsed.food_items) && parsed.food_items.length > 0) {
                food_items = parsed.food_items;
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // Case 2: text/name description provided (and image didn't already populate items with calories)
      const stillNeedsText = food_items.length === 0 || !food_items.some((i) => (i.calories || 0) > 0);
      if (descriptionText && stillNeedsText) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: "user", parts: [{ text: `Meal type: ${mealType}\nDescription: ${descriptionText}` }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
            }),
          }
        );
        if (geminiRes.ok) {
          const aiResult = await geminiRes.json();
          const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
          const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
          try {
            const parsed = JSON.parse(jsonMatch[1]!.trim());
            if (Array.isArray(parsed.food_items) && parsed.food_items.length > 0) {
              food_items = parsed.food_items;
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch { /* AI failures are non-blocking */ }
  }

  // Always compute totals from whatever food_items we have (from AI or pre-sent by client)
  if (food_items.length > 0) {
    total_calories = food_items.reduce((s, i) => s + (i.calories || 0), 0);
    total_protein  = food_items.reduce((s, i) => s + (i.protein  || 0), 0);
    total_carbs    = food_items.reduce((s, i) => s + (i.carbs    || 0), 0);
    total_fat      = food_items.reduce((s, i) => s + (i.fat      || 0), 0);
  }

  const body = {
    ...req.body,
    patient_id: link.patient_id,
    doctor_id: link.doctor_id,
    food_items: food_items.length > 0 ? food_items : (req.body?.food_items ?? []),
    ...(total_calories !== undefined && { total_calories, total_protein, total_carbs, total_fat }),
  };
  const doc = await FoodLog.create(body);
  const points_earned = POINTS.food;
  const filterFood: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filterFood);
  await updateGamificationState(link.patient_id, "food", filterFood);
  // Email: food logged
  try {
    const authU = await AuthUser.findOne({ user_id: (req as AuthRequest).user.id }).select("email full_name").lean();
    if (authU && (authU as any).email) {
      sendFoodLoggedEmail((authU as any).email, (authU as any).full_name || "there", req.body?.meal_type || "Meal", rawNotes || "", (req as AuthRequest).user.id).catch(() => {});
    }
  } catch {}
  res.status(201).json({ ...doc.toJSON(), id: (doc as any)._id?.toString(), points_earned, ...rewards });
});

router.patch("/me/food_logs/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const { id } = req.params;
  const existing = await FoodLog.findOne({ _id: id, patient_id: link.patient_id }).lean();
  if (!existing) return res.status(404).json({ error: "Food log not found" });

  const { notes, meal_type } = req.body as { notes?: string; meal_type?: string };
  const updatedMealType = meal_type || (existing as any).meal_type || "other";
  const updatedNotes = notes !== undefined ? notes : (existing as any).notes || "";

  // AI re-assessment: parse nutrition from text description
  let food_items: { name: string; quantity?: number; unit?: string; calories?: number; protein?: number; carbs?: number; fat?: number }[] = [];
  let total_calories = 0;
  let total_protein = 0;
  let total_carbs = 0;
  let total_fat = 0;

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && updatedNotes.trim()) {
    try {
      const systemPrompt = `You are a nutrition parser. Analyze the meal description and extract food items with accurate nutritional values.
Return ONLY valid JSON: { "food_items": [{ "name": "string", "quantity": number, "unit": "string", "calories": number, "protein": number, "carbs": number, "fat": number }] }
For Indian foods use common serving sizes. Estimate values based on typical portions. Always return valid JSON only.`;
      const userPrompt = `Meal type: ${updatedMealType}\nDescription: ${updatedNotes}`;
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
          }),
        }
      );
      if (geminiRes.ok) {
        const aiResult = await geminiRes.json();
        const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        try {
          const parsed = JSON.parse(jsonMatch[1]!.trim());
          if (Array.isArray(parsed.food_items)) {
            food_items = parsed.food_items as typeof food_items;
            total_calories = food_items.reduce((s, i) => s + (i.calories || 0), 0);
            total_protein = food_items.reduce((s, i) => s + (i.protein || 0), 0);
            total_carbs = food_items.reduce((s, i) => s + (i.carbs || 0), 0);
            total_fat = food_items.reduce((s, i) => s + (i.fat || 0), 0);
          }
        } catch { /* keep zeros */ }
      }
    } catch { /* keep zeros */ }
  }

  // If AI re-assessment returned nothing, preserve the existing stored nutrition
  const hasNewNutrition = food_items.length > 0 && total_calories > 0;
  const updatePayload: Record<string, unknown> = {
    meal_type: updatedMealType,
    notes: updatedNotes,
    food_items: hasNewNutrition ? food_items : ((existing as any).food_items ?? []),
    total_calories: hasNewNutrition ? total_calories : ((existing as any).total_calories ?? 0),
    total_protein: hasNewNutrition ? total_protein : ((existing as any).total_protein ?? 0),
    total_carbs: hasNewNutrition ? total_carbs : ((existing as any).total_carbs ?? 0),
    total_fat: hasNewNutrition ? total_fat : ((existing as any).total_fat ?? 0),
    updated_at: new Date(),
  };

  const updated = await FoodLog.findOneAndUpdate(
    { _id: id, patient_id: link.patient_id },
    { $set: updatePayload },
    { new: true }
  ).lean();

  res.json({ ...updated, id: (updated as any)?._id?.toString(), _id: undefined, __v: undefined });
});

router.get("/me/medication-log", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await MedicationLog.find(filter).sort({ logged_at: -1 }).limit(30).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/medication-log", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const taken = req.body?.taken === true || req.body?.taken === "true";
  const body = {
    patient_id: link.patient_id,
    doctor_id: link.doctor_id,
    taken,
    source: req.body?.source || "quick_log",
    time_of_day: req.body?.time_of_day || undefined,
    medication_name: req.body?.medication_name || undefined,
  };
  const doc = await MedicationLog.create(body);
  await resolveReminderEscalation(link.patient_id, "medication");
  const points_earned = POINTS.medication;
  const filterMed: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filterMed);
  await updateGamificationState(link.patient_id, "medication", filterMed);
  // Email: medication logged
  try {
    const authU = await AuthUser.findOne({ user_id: (req as AuthRequest).user.id }).select("email full_name").lean();
    if (authU && (authU as any).email) {
      sendMedicationLoggedEmail((authU as any).email, (authU as any).full_name || "there", req.body?.medication_name || "Medication", taken, (req as AuthRequest).user.id).catch(() => {});
    }
  } catch {}
  res.status(201).json({ ...doc.toJSON(), points_earned, ...rewards });
});

router.post("/me/medication-log/bulk", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const entries = req.body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return res.status(400).json({ error: "entries array required (each: time_of_day, medication_name, taken)" });
  }
  const created = [];
  for (const e of entries) {
    const time_of_day = e.time_of_day && ["morning", "afternoon", "evening", "night"].includes(String(e.time_of_day)) ? e.time_of_day : undefined;
    const medication_name = e.medication_name != null ? String(e.medication_name).trim() : undefined;
    const taken = e.taken === true || e.taken === "true";
    created.push(
      await MedicationLog.create({
        patient_id: link.patient_id,
        doctor_id: link.doctor_id,
        taken,
        time_of_day: time_of_day || undefined,
        medication_name: medication_name || undefined,
        source: "quick_log",
      })
    );
  }
  if (created.length > 0) await resolveReminderEscalation(link.patient_id, "medication");
  const points_earned = created.length > 0 ? POINTS.medication : 0;
  const filterBulkMed: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filterBulkMed);
  if (created.length > 0) await updateGamificationState(link.patient_id, "medication", filterBulkMed);
  res.status(201).json({ created: created.length, ids: created.map((d: any) => d._id?.toString()), points_earned, ...rewards });
});

// ---------- Medications (persistent list) ----------
router.get("/me/medications", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const active = req.query.active !== "false";
  const list = await Medication.find({ ...filter, ...(active ? { active: true } : {}) }).sort({ added_at: -1 }).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/me/medications", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const { medicine, dosage, frequency, duration, instructions, timing_display, suggested_time, food_relation, timings } = req.body;
  if (!medicine || !String(medicine).trim()) return res.status(400).json({ error: "medicine name required" });
  const doc = await Medication.create({
    patient_id: link.patient_id,
    doctor_id: link.doctor_id,
    medicine: String(medicine).trim(),
    dosage: dosage || undefined,
    frequency: frequency || undefined,
    duration: duration || undefined,
    instructions: instructions || undefined,
    timing_display: timing_display || undefined,
    suggested_time: suggested_time || undefined,
    food_relation: food_relation || undefined,
    timings: Array.isArray(timings) ? timings : [],
    source: "manual",
  });
  res.status(201).json(doc.toJSON());
});

router.patch("/me/medications/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const med = await Medication.findOne({ _id: req.params.id, ...filter });
  if (!med) return res.status(404).json({ error: "Medication not found" });
  const allowed = ["medicine", "dosage", "frequency", "duration", "instructions", "timing_display", "suggested_time", "food_relation", "timings", "active"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) (med as any)[key] = req.body[key];
  }
  await med.save();
  res.json(med.toJSON());
});

router.delete("/me/medications/:id", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked to your account" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const deleted = await Medication.findOneAndDelete({ _id: req.params.id, ...filter });
  if (!deleted) return res.status(404).json({ error: "Medication not found" });
  res.json({ success: true });
});

// Upload prescription → AI parse → save medications + document
router.post("/me/medications/upload-prescription", requireAuth, upload.single("file"), async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "AI not configured (GEMINI_API_KEY)" });
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "file required" });
  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) return res.status(400).json({ error: "Only image (JPEG, PNG, WebP) or PDF supported" });

  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const analysis = isPdf
      ? await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "pdf", buffer: buf, fileName: file.originalname || file.filename })
      : await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "image", base64: buf.toString("base64"), mimeType: mime });

    // Save as PatientDocument (shows in Documents tab)
    const extractedData: Record<string, unknown> = { key_points: analysis.key_points };
    if (analysis.chart_data) extractedData.chart_data = analysis.chart_data;
    if (analysis.prescription_summary) extractedData.prescription_summary = analysis.prescription_summary;
    if (analysis.medications?.length) extractedData.medications = analysis.medications;

    const patDoc = await PatientDocument.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      uploaded_by: (req as AuthRequest).user.id,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: "prescription",
      notes: req.body?.notes || null,
      ai_summary: analysis.summary || null,
      layman_summary: analysis.layman_summary || null,
      extracted_data: extractedData,
      analyzed_at: new Date(),
    });

    // Save extracted medications
    const savedMeds: any[] = [];
    if (analysis.medications && analysis.medications.length > 0) {
      for (const m of analysis.medications) {
        const med = await Medication.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          medicine: m.medicine || "Unknown",
          dosage: m.dosage || undefined,
          frequency: m.frequency || undefined,
          duration: m.duration || undefined,
          instructions: m.instructions || undefined,
          timing_display: m.timing_display || undefined,
          suggested_time: m.suggested_time || undefined,
          food_relation: m.food_relation || undefined,
          timings: Array.isArray(m.timings) ? m.timings : [],
          source: "prescription",
          prescription_document_id: patDoc._id?.toString(),
        });
        savedMeds.push(med.toJSON());
      }
    }

    res.status(201).json({
      document: patDoc.toJSON(),
      medications: savedMeds,
      prescription_summary: analysis.prescription_summary || null,
      medications_count: savedMeds.length,
    });
  } catch (e) {
    // If AI fails, still save the document
    const patDoc = await PatientDocument.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      uploaded_by: (req as AuthRequest).user.id,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: "prescription",
      notes: req.body?.notes || null,
    });
    res.status(201).json({
      document: patDoc.toJSON(),
      medications: [],
      prescription_summary: null,
      medications_count: 0,
      ai_error: "Could not analyze prescription. You can add medications manually.",
    });
  }
});

// ---------- Push subscriptions (Solution 6) ----------
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails("mailto:support@mediimate.com", VAPID_PUBLIC, VAPID_PRIVATE);
}

router.post("/me/push-subscribe", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { subscription } = req.body as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return res.status(400).json({ error: "subscription with endpoint and keys (p256dh, auth) required" });
  }
  const userAgent = (req.get("user-agent") || "").slice(0, 200);
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    { user_id: userId, endpoint: subscription.endpoint, keys: subscription.keys, user_agent: userAgent, updated_at: new Date() },
    { upsert: true, new: true }
  );
  res.json({ ok: true });
});

router.delete("/me/push-subscribe", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const endpoint = (req.body?.endpoint || req.query?.endpoint) as string | undefined;
  if (!endpoint) return res.status(400).json({ error: "endpoint required" });
  await PushSubscription.deleteOne({ user_id: userId, endpoint });
  res.json({ ok: true });
});

router.get("/me/push-subscribe", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const sub = await PushSubscription.findOne({ user_id: userId }).select("endpoint updated_at").lean();
  res.json({ subscribed: !!sub, endpoint: sub ? (sub as any).endpoint : null });
});

// One-time token redeem: log from notification (Solution 6)
router.post("/me/quick-log-from-notification", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string") return res.status(400).json({ error: "token required" });
  const doc = await QuickLogToken.findOne({ token, user_id: userId }).lean();
  if (!doc) return res.status(404).json({ error: "Invalid or expired token" });
  const t = doc as { used_at?: Date; type: string; value_text?: string; meal_type?: string; taken?: boolean };
  if (t.used_at) return res.status(400).json({ error: "Token already used" });
  if (new Date() > new Date((doc as any).expires_at)) return res.status(400).json({ error: "Token expired" });
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  if (t.type === "blood_pressure" || t.type === "blood_sugar") {
    const unit = t.type === "blood_pressure" ? "mmHg" : "mg/dL";
    const num = t.value_text ? parseFloat(t.value_text.replace(/\/.*/, "")) : undefined;
    await Vital.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      vital_type: t.type,
      value_text: t.value_text || "",
      value_numeric: Number.isFinite(num) ? num : undefined,
      unit,
      source: "push",
    });
    await resolveReminderEscalation(link.patient_id, t.type as "blood_pressure" | "blood_sugar");
  } else if (t.type === "food") {
    await FoodLog.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      meal_type: t.meal_type || "other",
      source: "push",
    });
  } else if (t.type === "medication") {
    await MedicationLog.create({
      patient_id: link.patient_id,
      doctor_id: link.doctor_id,
      taken: t.taken === true,
      source: "push",
    });
    await resolveReminderEscalation(link.patient_id, "medication");
  }
  await QuickLogToken.updateOne({ token }, { used_at: new Date() });
  const points_earned = t.type === "blood_pressure" ? POINTS.blood_pressure : t.type === "blood_sugar" ? POINTS.blood_sugar : t.type === "food" ? POINTS.food : t.type === "medication" ? POINTS.medication : 0;
  const filterQ: RewardsFilter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const rewards = await getRewardsForFilter(filterQ);
  const logTypeMap: Record<string, "blood_pressure" | "blood_sugar" | "food" | "medication"> = { blood_pressure: "blood_pressure", blood_sugar: "blood_sugar", food: "food", medication: "medication" };
  if (logTypeMap[t.type]) await updateGamificationState(link.patient_id, logTypeMap[t.type], filterQ);
  res.json({ ok: true, points_earned, ...rewards });
});

// ---------- Layer 4: Accountability (doctor / family visibility) ----------
/** Get today's log status (UTC) for a set of patient_ids. */
async function getTodayLogStatus(patientIds: string[]): Promise<{ bp: boolean; food: boolean; sugar: boolean; medication: boolean }> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const filter = patientIds.length > 1 ? { patient_id: { $in: patientIds } } : { patient_id: patientIds[0] };
  const [bp, food, sugar, medication] = await Promise.all([
    Vital.findOne({ ...filter, vital_type: "blood_pressure", recorded_at: { $gte: startOfToday } }).select("_id").lean(),
    FoodLog.findOne({ ...filter, logged_at: { $gte: startOfToday } }).select("_id").lean(),
    Vital.findOne({ ...filter, vital_type: "blood_sugar", recorded_at: { $gte: startOfToday } }).select("_id").lean(),
    MedicationLog.findOne({ ...filter, logged_at: { $gte: startOfToday } }).select("_id").lean(),
  ]);
  return { bp: !!bp, food: !!food, sugar: !!sugar, medication: !!medication };
}

/** GET /me/accountability - patient: doctor visibility, family connections, doctor messages (for UI). */
router.get("/me/accountability", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const link = await getPatientForCurrentUser(req);
  let doctor_can_see_logs = false;
  let doctor_name: string | null = null;
  if (link && link.doctor_id !== userId) {
    doctor_can_see_logs = true;
    const profile = await Profile.findOne({ user_id: link.doctor_id }).select("full_name").lean();
    doctor_name = (profile as { full_name?: string })?.full_name || null;
  }
  const connections = await FamilyConnection.find({ patient_user_id: userId }).lean();
  
  // Fetch profiles and emails for linked family connections
  const familyUserIds = connections.map((c: any) => c.family_user_id).filter(Boolean);
  const [familyProfiles, familyAuthUsers] = await Promise.all([
    Profile.find({ user_id: { $in: familyUserIds } }).select("user_id phone full_name").lean(),
    AuthUser.find({ user_id: { $in: familyUserIds } }).select("user_id email").lean(),
  ]);
  const profileMap = new Map(familyProfiles.map((p: any) => [p.user_id, p]));
  const emailMap = new Map(familyAuthUsers.map((u: any) => [u.user_id, u.email]));

  const family_connections = (connections as any[]).map((c) => {
    const prof = c.family_user_id ? profileMap.get(c.family_user_id) : null;
    const email = c.family_user_id ? emailMap.get(c.family_user_id) : null;
    const resolvedPhone = c.invite_phone || (prof as any)?.phone || null;
    return {
      id: c._id?.toString(),
      relationship: c.relationship,
      invite_email: c.invite_email || email || null,
      invite_phone: resolvedPhone,
      phone_number: resolvedPhone,
      status: c.status,
      family_user_id: c.family_user_id || null,
      access_vitals: c.access_vitals ?? true,
      access_chat: c.access_chat ?? false,
      access_meds: c.access_meds ?? true,
    };
  });
  const patientIds = link?.patient_ids ?? [];
  const doctor_messages: { id: string; message: string; created_at: string; doctor_name?: string }[] = [];
  if (patientIds.length > 0) {
    const messages = await DoctorMessage.find({ patient_id: { $in: patientIds } })
      .sort({ created_at: -1 })
      .limit(20)
      .lean();
    const doctorIds = [...new Set((messages as any[]).map((m) => m.doctor_id))];
    const profiles = await Profile.find({ user_id: { $in: doctorIds } }).select("user_id full_name").lean();
    const nameByDoctor: Record<string, string> = {};
    for (const p of profiles as { user_id: string; full_name?: string }[]) nameByDoctor[p.user_id] = p.full_name || "";
    for (const m of messages as any[]) {
      doctor_messages.push({
        id: m._id?.toString(),
        message: m.message,
        created_at: m.created_at?.toISOString?.() ?? new Date().toISOString(),
        doctor_name: nameByDoctor[m.doctor_id] || undefined,
      });
    }
  }
  res.json({ doctor_can_see_logs, doctor_name, family_connections, doctor_messages });
});

router.get("/me/doctor-messages", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const patientIds = link.patient_ids;
  const list = await DoctorMessage.find({ patient_id: { $in: patientIds } })
    .sort({ created_at: -1 })
    .limit(50)
    .lean();
  const doctorIds = [...new Set((list as any[]).map((m) => m.doctor_id))];
  const profiles = await Profile.find({ user_id: { $in: doctorIds } }).select("user_id full_name").lean();
  const nameByDoctor: Record<string, string> = {};
  for (const p of profiles as { user_id: string; full_name?: string }[]) nameByDoctor[p.user_id] = p.full_name || "";
  res.json(
    (list as any[]).map((m) => ({
      id: m._id?.toString(),
      message: m.message,
      created_at: m.created_at?.toISOString?.() ?? new Date().toISOString(),
      doctor_name: nameByDoctor[m.doctor_id] || "Doctor",
    }))
  );
});

router.get("/me/family-connections", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const list = await FamilyConnection.find({ patient_user_id: userId }).sort({ created_at: -1 }).lean();
  
  // Populate details dynamically
  const familyUserIds = list.map((c: any) => c.family_user_id).filter(Boolean);
  const [familyProfiles, familyAuthUsers] = await Promise.all([
    Profile.find({ user_id: { $in: familyUserIds } }).select("user_id phone full_name").lean(),
    AuthUser.find({ user_id: { $in: familyUserIds } }).select("user_id email").lean(),
  ]);
  const profileMap = new Map(familyProfiles.map((p: any) => [p.user_id, p]));
  const emailMap = new Map(familyAuthUsers.map((u: any) => [u.user_id, u.email]));

  res.json(
    list.map((d: any) => {
      const prof = d.family_user_id ? profileMap.get(d.family_user_id) : null;
      const email = d.family_user_id ? emailMap.get(d.family_user_id) : null;
      const resolvedPhone = d.invite_phone || (prof as any)?.phone || null;
      return {
        id: d._id?.toString(),
        relationship: d.relationship,
        invite_email: d.invite_email || email || null,
        invite_phone: resolvedPhone,
        phone_number: resolvedPhone,
        status: d.status,
        family_user_id: d.family_user_id || null,
        created_at: d.created_at?.toISOString?.() ?? new Date().toISOString(),
      };
    })
  );
});

router.post("/me/family-connections", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  
  const { invite_email, invite_phone, relationship, access_vitals, access_chat, access_meds } = req.body as { invite_email?: string; invite_phone?: string; relationship?: string; access_vitals?: boolean; access_chat?: boolean; access_meds?: boolean };
  
  const email = invite_email ? String(invite_email).trim().toLowerCase() : "";
  const phone = invite_phone ? String(invite_phone).trim() : "";
  
  if (!email && !phone) {
    return res.status(400).json({ error: "invite_email or invite_phone required" });
  }

  const rel = relationship === "son" || relationship === "daughter" || relationship === "spouse" ? relationship : "other";

  if (email) {
    const existing = await FamilyConnection.findOne({ patient_user_id: userId, invite_email: email }).lean();
    if (existing) return res.status(400).json({ error: "Already invited this email" });
  }
  if (phone) {
    const existing = await FamilyConnection.findOne({ patient_user_id: userId, invite_phone: phone }).lean();
    if (existing) return res.status(400).json({ error: "Already invited this phone number" });
  }

  // Look up if a matching user is already registered in DB
  let familyUserId: string | null = null;
  let status = "pending";

  if (email) {
    const authU = await AuthUser.findOne({ email }).select("user_id").lean();
    if (authU) {
      familyUserId = (authU as any).user_id;
      status = "active";
    }
  }

  if (!familyUserId && phone) {
    const prof = await Profile.findOne({ phone }).select("user_id").lean();
    if (prof) {
      familyUserId = (prof as any).user_id;
      status = "active";
    }
  }

  const doc = await FamilyConnection.create({
    patient_user_id: userId,
    family_user_id: familyUserId,
    invite_email: email || null,
    invite_phone: phone || null,
    relationship: rel,
    status,
    access_vitals: access_vitals ?? true,
    access_chat: access_chat ?? false,
    access_meds: access_meds ?? true,
  });

  res.status(201).json({
    id: doc._id?.toString(),
    relationship: rel,
    invite_email: email || null,
    invite_phone: phone || null,
    phone_number: phone || null,
    status,
    family_user_id: familyUserId,
    access_vitals: doc.access_vitals,
    access_chat: doc.access_chat,
    access_meds: doc.access_meds,
  });

  // If invited by email, send family invitation email (fire-and-forget)
  if (email) {
    try {
      const prof = await Profile.findOne({ user_id: userId }).select("full_name").lean();
      const patient = await Patient.findOne({ patient_user_id: userId }).select("full_name").lean();
      sendFamilyInvitationEmail(email, (patient as any)?.full_name || "a patient", (prof as any)?.full_name || "Someone").catch(() => {});
    } catch {}
  }

  // If invited by phone, send WhatsApp invitation text (fire-and-forget)
  if (phone) {
    try {
      const prof = await Profile.findOne({ user_id: userId }).select("full_name").lean();
      const patient = await Patient.findOne({ patient_user_id: userId }).select("full_name").lean();
      const senderName = (prof as any)?.full_name || (patient as any)?.full_name || "A patient";
      const message = `Hello! You've been invited by ${senderName} on Mediimate to link accounts as a Family member. Click http://localhost:8082 to register and view their daily health logs.`;
      whatsapp.sendText(phone, message).catch(() => {});
    } catch {}
  }
});

router.patch("/me/family-connections/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { access_vitals, access_chat, access_meds } = req.body;
  const updateFields: any = {};
  if (access_vitals !== undefined) updateFields.access_vitals = access_vitals;
  if (access_chat !== undefined) updateFields.access_chat = access_chat;
  if (access_meds !== undefined) updateFields.access_meds = access_meds;
  
  const updated = await FamilyConnection.findOneAndUpdate(
    { _id: req.params.id, patient_user_id: userId },
    { $set: updateFields },
    { new: true }
  ).lean();
  
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/me/family-connections/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const deleted = await FamilyConnection.findOneAndDelete({
    _id: req.params.id,
    patient_user_id: userId,
  });
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

/** Family dashboard: linked patients' today log status (for family role users). */
router.get("/family/dashboard", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const connections = await FamilyConnection.find({ family_user_id: userId, status: "active" }).lean();
  if (connections.length === 0) {
    return res.json({ patients: [] });
  }
  const patientUserIds = [...new Set((connections as any[]).map((c) => c.patient_user_id))];
  const patients = await Patient.find({ patient_user_id: { $in: patientUserIds } }).select("_id patient_user_id full_name").lean();
  const patientIdsByUser: Record<string, string[]> = {};
  for (const p of patients as { _id: unknown; patient_user_id: string }[]) {
    const uid = p.patient_user_id;
    if (!patientIdsByUser[uid]) patientIdsByUser[uid] = [];
    const id = p._id?.toString();
    if (id) patientIdsByUser[uid].push(id);
  }
  const relByPatient: Record<string, string> = {};
  for (const c of connections as any[]) {
    relByPatient[c.patient_user_id] = c.relationship;
  }
  const results: { patient_user_id: string; full_name: string; relationship: string; today: { bp: boolean; food: boolean; sugar: boolean; medication: boolean } }[] = [];
  for (const uid of patientUserIds) {
    const ids = patientIdsByUser[uid] || [];
    const today = await getTodayLogStatus(ids);
    const first = (patients as any[]).find((p) => p.patient_user_id === uid);
    results.push({
      patient_user_id: uid,
      full_name: first?.full_name ?? "Patient",
      relationship: relByPatient[uid] ?? "other",
      today,
    });
  }
  res.json({ patients: results });
});

/** Doctor sends a message to patient (shown in patient app). */
router.post("/patients/:id/message", requireAuth, async (req, res) => {
  const doctorId = (req as AuthRequest).user.id;
  const patientId = req.params.id;
  const canAccess = await doctorCanAccessPatient(doctorId, patientId);
  if (!canAccess) return res.status(404).json({ error: "Patient not found" });
  const { message } = req.body as { message?: string };
  const text = message != null ? String(message).trim() : "";
  if (!text) return res.status(400).json({ error: "message required" });
  const doc = await DoctorMessage.create({ doctor_id: doctorId, patient_id: patientId, message: text });
  // Email: notify patient about doctor message
  try {
    const patientRec = await Patient.findById(patientId).select("patient_user_id full_name").lean();
    const patientUserId = (patientRec as any)?.patient_user_id;
    if (patientUserId) {
      const [patientAuth, doctorAuth] = await Promise.all([
        AuthUser.findOne({ user_id: patientUserId }).select("email full_name").lean(),
        AuthUser.findOne({ user_id: doctorId }).select("full_name").lean(),
      ]);
      if (patientAuth && (patientAuth as any).email) {
        sendDoctorMessageEmail(
          (patientAuth as any).email,
          (patientAuth as any).full_name || (patientRec as any)?.full_name || "there",
          (doctorAuth as any)?.full_name || "Your Doctor",
          text,
          patientUserId
        ).catch(() => {});
      }
    }
  } catch {}
  res.status(201).json({
    id: doc._id?.toString(),
    message: text,
    created_at: (doc as any).created_at?.toISOString?.() ?? new Date().toISOString(),
  });
});

// ---------- Routine detection (Solution 7): usual log times in UTC (frontend uses browser local) ----------
router.get("/me/quick-log/routine", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 14);

  const aggHour = (collection: mongoose.Model<mongoose.Document>, match: Record<string, unknown>) =>
    collection.aggregate([
      { $match: { ...filter, ...match } },
      { $match: { recorded_at: { $gte: lookback } } },
      { $project: { hour: { $hour: "$recorded_at" }, minute: { $minute: "$recorded_at" } } },
      { $group: { _id: { hour: "$hour", minute: "$minute" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]);

  const [bp, sugar, food, med] = await Promise.all([
    aggHour(Vital as any, { vital_type: "blood_pressure" }).then((r) => r[0] as { _id?: { hour: number; minute: number } } | undefined),
    aggHour(Vital as any, { vital_type: "blood_sugar" }).then((r) => r[0] as { _id?: { hour: number; minute: number } } | undefined),
    FoodLog.aggregate([
      { $match: filter },
      { $match: { logged_at: { $gte: lookback } } },
      { $project: { hour: { $hour: "$logged_at" }, minute: { $minute: "$logged_at" } } },
      { $group: { _id: { hour: "$hour", minute: "$minute" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]).then((r) => r[0] as { _id?: { hour: number; minute: number } } | undefined),
    MedicationLog.aggregate([
      { $match: filter },
      { $match: { logged_at: { $gte: lookback } } },
      { $project: { hour: { $hour: "$logged_at" }, minute: { $minute: "$logged_at" } } },
      { $group: { _id: { hour: "$hour", minute: "$minute" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]).then((r) => r[0] as { _id?: { hour: number; minute: number } } | undefined),
  ]);

  const toRoutine = (r: { _id?: { hour: number; minute: number } } | undefined) =>
    r?._id ? { hour_utc: r._id.hour, minute_utc: r._id.minute } : null;

  res.json({
    blood_pressure: toRoutine(bp),
    blood_sugar: toRoutine(sugar),
    food: toRoutine(food),
    medication: toRoutine(med),
  });
});

// Internal: send routine pushes (call from cron / Netlify scheduled function). Requires CRON_SECRET.
async function getRoutineForUserId(userId: string): Promise<{ blood_pressure: { hour_utc: number; minute_utc: number } | null; blood_sugar: { hour_utc: number; minute_utc: number } | null }> {
  const patients = await Patient.find({ patient_user_id: userId }).select("_id").lean();
  if (patients.length === 0) return { blood_pressure: null, blood_sugar: null };
  const patientIds = (patients as { _id: unknown }[]).map((p) => p._id?.toString()).filter(Boolean) as string[];
  const filter = patientIds.length > 1 ? { patient_id: { $in: patientIds } } : { patient_id: patientIds[0] };
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 14);
  const agg = (vitalType: string) =>
    Vital.aggregate([
      { $match: { ...filter, vital_type: vitalType } },
      { $match: { recorded_at: { $gte: lookback } } },
      { $project: { hour: { $hour: "$recorded_at" }, minute: { $minute: "$recorded_at" } } },
      { $group: { _id: { hour: "$hour", minute: "$minute" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 },
    ]).then((r) => (r[0] as { _id?: { hour: number; minute: number } })?._id ?? null);
  const [bp, sugar] = await Promise.all([agg("blood_pressure"), agg("blood_sugar")]);
  return {
    blood_pressure: bp ? { hour_utc: bp.hour, minute_utc: bp.minute } : null,
    blood_sugar: sugar ? { hour_utc: sugar.hour, minute_utc: sugar.minute } : null,
  };
}

router.post("/internal/send-routine-pushes", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return res.json({ sent: 0, error: "VAPID not configured" });
  const now = new Date();
  const hourUtc = now.getUTCHours();
  const batchSize = LIMITS.PUSH_SUBSCRIPTION_BATCH;
  let sent = 0;
  let skip = 0;
  let batch: { user_id: string; endpoint: string; keys: { p256dh: string; auth: string } }[];
  do {
    batch = (await PushSubscription.find({}).skip(skip).limit(batchSize).lean()) as typeof batch;
    for (const sub of batch) {
    try {
      const routine = await getRoutineForUserId(sub.user_id);
      const defaultBp = "120/80";
      const defaultSugar = "100";
      // Helper to get email for routine email reminders
      const getUserEmail = async (uid: string) => {
        const u = await AuthUser.findOne({ user_id: uid }).select("email full_name").lean();
        return u ? { email: (u as any).email, name: (u as any).full_name || "there" } : null;
      };

      if (routine.blood_pressure && routine.blood_pressure.hour_utc === hourUtc) {
        const token = crypto.randomBytes(24).toString("hex");
        await QuickLogToken.create({
          token,
          user_id: sub.user_id,
          type: "blood_pressure",
          value_text: defaultBp,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({
            title: "Log BP now",
            body: `Tap to log ${defaultBp}`,
            tag: "routine-bp",
            data: { token, type: "blood_pressure", value: defaultBp },
          }),
          { TTL: 60 * 15 }
        );
        // Email: BP reminder
        const eu = await getUserEmail(sub.user_id);
        if (eu?.email) sendMedicationReminderEmail(eu.email, eu.name, "Blood Pressure", "It's time to log your blood pressure reading.", sub.user_id).catch(() => {});
        sent++;
      }
      if (routine.blood_sugar && routine.blood_sugar.hour_utc === hourUtc) {
        const token = crypto.randomBytes(24).toString("hex");
        await QuickLogToken.create({
          token,
          user_id: sub.user_id,
          type: "blood_sugar",
          value_text: defaultSugar,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        });
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify({
            title: "Log blood sugar now",
            body: `Tap to log ${defaultSugar} mg/dL`,
            tag: "routine-sugar",
            data: { token, type: "blood_sugar", value: defaultSugar },
          }),
          { TTL: 60 * 15 }
        );
        // Email: blood sugar reminder
        const eu2 = await getUserEmail(sub.user_id);
        if (eu2?.email) sendMedicationReminderEmail(eu2.email, eu2.name, "Blood Sugar", "It's time to log your blood sugar reading.", sub.user_id).catch(() => {});
        sent++;
      }
      // Medication reminders based on patient's active medications
      const patients = await Patient.find({ patient_user_id: sub.user_id }).select("_id").lean();
      const patIds = (patients as { _id: unknown }[]).map((p) => p._id?.toString()).filter(Boolean) as string[];
      if (patIds.length > 0) {
        const medFilter = patIds.length > 1 ? { patient_id: { $in: patIds } } : { patient_id: patIds[0] };
        const activeMeds = await Medication.find({ ...medFilter, active: true }).select("medicine timing_display timings suggested_time").lean();
        const hourStr = String(hourUtc).padStart(2, "0");
        const medsToRemind = (activeMeds as any[]).filter((m) => {
          if (m.timings?.length > 0) return m.timings.some((t: string) => t.startsWith(hourStr));
          if (m.suggested_time) return m.suggested_time.startsWith(hourStr);
          return false;
        });
        if (medsToRemind.length > 0) {
          const names = medsToRemind.map((m: any) => m.medicine).slice(0, 3).join(", ");
          const more = medsToRemind.length > 3 ? ` +${medsToRemind.length - 3} more` : "";
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({
              title: "Time for your medication",
              body: `Take: ${names}${more}`,
              tag: "routine-medication",
              data: { type: "medication" },
            }),
            { TTL: 60 * 30 }
          );
          // Email: medication reminder
          const eu3 = await getUserEmail(sub.user_id);
          if (eu3?.email) sendMedicationReminderEmail(eu3.email, eu3.name, names + more, "It's time to take your medication.", sub.user_id).catch(() => {});
          sent++;
        }
      }
    } catch {
      // Skip failed subscription (expired/invalid)
    }
    }
    skip += batchSize;
  } while (batch.length === batchSize);
  res.json({ sent });
});

// ---------- Smart reminders: Layer 2 (triggers) + Layer 3 (adaptive escalation) ----------
/** Resolve any open reminder escalation when user logs (BP, sugar, or medication). */
async function resolveReminderEscalation(patientId: string, triggerType: "blood_pressure" | "blood_sugar" | "medication") {
  await ReminderEscalation.updateMany(
    { patient_id: patientId, trigger_type: triggerType, resolved_at: null },
    { resolved_at: new Date() }
  );
}

/** Get patient link by user_id (for cron, no request). */
async function getPatientLinkByUserId(userId: string): Promise<{ patient_id: string; doctor_id: string; patient_ids: string[] } | null> {
  const patients = await Patient.find({ patient_user_id: userId }).select("_id doctor_id").lean();
  if (!patients?.length) return null;
  const patient_ids = (patients as { _id: unknown }[]).map((p) => p._id?.toString()).filter(Boolean) as string[];
  const activeLink = await PatientDoctorLink.findOne({ patient_user_id: userId, status: "active" })
    .select("doctor_user_id")
    .sort({ responded_at: -1 })
    .lean();
  if (activeLink) {
    const docId = (activeLink as { doctor_user_id: string }).doctor_user_id;
    const linked = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id === docId);
    if (linked) return { patient_id: linked._id?.toString() as string, doctor_id: docId, patient_ids };
  }
  const underDoctor = (patients as { _id: unknown; doctor_id: string }[]).find((p) => p.doctor_id && p.doctor_id !== userId);
  if (underDoctor) return { patient_id: underDoctor._id?.toString() as string, doctor_id: underDoctor.doctor_id, patient_ids };
  const first = patients[0] as { _id: unknown; doctor_id: string };
  return { patient_id: first._id?.toString() as string, doctor_id: first.doctor_id, patient_ids };
}

/** Check if patient logged this trigger type today (UTC). */
async function didPatientLogToday(patientIds: string[], triggerType: "blood_pressure" | "blood_sugar" | "medication"): Promise<boolean> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const filter = patientIds.length > 1 ? { patient_id: { $in: patientIds } } : { patient_id: patientIds[0] };
  if (triggerType === "blood_pressure" || triggerType === "blood_sugar") {
    const last = await Vital.findOne({
      ...filter,
      vital_type: triggerType,
      recorded_at: { $gte: startOfToday },
    })
      .select("_id")
      .lean();
    return !!last;
  }
  const last = await MedicationLog.findOne({
    ...filter,
    logged_at: { $gte: startOfToday },
  })
    .select("_id")
    .lean();
  return !!last;
}

/** Days since anchor (UTC date diff). */
function daysSince(date: Date): number {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

const ESCALATION_MESSAGES = {
  blood_pressure: {
    day1: { title: "Reminder: Log your BP", body: "Don't forget to log your blood pressure today. It only takes a moment." },
    day2: { title: "We noticed you haven't logged BP", body: "Logging regularly helps your doctor care for you. Tap to log now." },
    day3: { title: "Important: Please log your BP", body: "Your care team is here if you need help. Log your blood pressure when you can." },
  },
  blood_sugar: {
    day1: { title: "Reminder: Log your blood sugar", body: "Don't forget to log your blood sugar today." },
    day2: { title: "We noticed you haven't logged blood sugar", body: "Regular logging helps your doctor support you. Tap to log now." },
    day3: { title: "Important: Please log your blood sugar", body: "Your care team is here if you need help. Log when you can." },
  },
  medication: {
    day1: { title: "Reminder: Did you take your medication?", body: "Mark your medications in the app when you take them." },
    day2: { title: "We noticed you haven't logged medication", body: "Logging helps your doctor track your care. Tap to log now." },
    day3: { title: "Important: Please log your medication", body: "Your care team is here if you need help. Log when you can." },
  },
};

/** Internal: process adaptive reminder escalations (Day 1 → 2 → 3 → 5). Call from cron daily. */
router.post("/internal/process-reminder-escalations", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  const now = new Date();
  const results = { day1: 0, day2: 0, day3: 0, day5: 0, resolved: 0 };
  const subs = await PushSubscription.find({}).select("user_id").lean();
  const userIds = [...new Set((subs as { user_id: string }[]).map((s) => s.user_id))];
  for (const userId of userIds) {
    const link = await getPatientLinkByUserId(userId);
    if (!link) continue;
    const { patient_id, doctor_id, patient_ids } = link;
    const patient = await Patient.findById(patient_id).select("full_name emergency_contact medications").lean();
    if (!patient) continue;
    const p = patient as { full_name?: string; emergency_contact?: string; medications?: string[] };
    const triggerTypes: ("blood_pressure" | "blood_sugar" | "medication")[] = ["blood_pressure", "blood_sugar", "medication"];
    for (const triggerType of triggerTypes) {
      const loggedToday = await didPatientLogToday(patient_ids, triggerType);
      if (loggedToday) {
        await resolveReminderEscalation(patient_id, triggerType);
        results.resolved++;
        continue;
      }
      const hasRoutine = await (async () => {
        if (triggerType === "medication") return (p.medications?.length ?? 0) > 0;
        const routine = await getRoutineForUserId(userId);
        return triggerType === "blood_pressure" ? !!routine.blood_pressure : !!routine.blood_sugar;
      })();
      if (!hasRoutine) continue;
      let esc = await ReminderEscalation.findOne({
        user_id: userId,
        patient_id,
        trigger_type: triggerType,
        resolved_at: null,
      }).lean();
      if (!esc) {
        const created = await ReminderEscalation.create({
          user_id: userId,
          patient_id,
          doctor_id,
          trigger_type: triggerType,
          anchor_date: now,
        });
        esc = created.toObject();
      }
      const e = esc as { anchor_date: Date; day1_sent_at?: Date; day2_sent_at?: Date; day3_sent_at?: Date; day5_sent_at?: Date };
      const day = daysSince(new Date(e.anchor_date));
      const sub = await PushSubscription.findOne({ user_id: userId }).lean();
      const pushPayload = sub as { endpoint: string; keys: { p256dh: string; auth: string } } | null;
      const triggerLabel = triggerType === "blood_pressure" ? "BP" : triggerType === "blood_sugar" ? "blood sugar" : "medication";
      // Helper: get email for escalation emails
      const escUserEmail = async () => {
        const u = await AuthUser.findOne({ user_id: userId }).select("email full_name").lean();
        return u ? { email: (u as any).email, name: (u as any).full_name || p.full_name || "there" } : null;
      };

      if (day >= 1 && !e.day1_sent_at) {
        const msg = ESCALATION_MESSAGES[triggerType].day1;
        if (pushPayload && VAPID_PUBLIC && VAPID_PRIVATE) {
          try {
            await webpush.sendNotification(
              { endpoint: pushPayload.endpoint, keys: pushPayload.keys },
              JSON.stringify({ title: msg.title, body: msg.body, tag: `escalation-${triggerType}-1`, data: { type: triggerType } }),
              { TTL: 86400 }
            );
          } catch (err) {
            console.error("Escalation push day1 failed", userId, err);
          }
        }
        await Notification.create({
          user_id: userId,
          title: msg.title,
          message: msg.body,
          category: "reminder",
          related_type: "reminder_escalation",
        });
        // Email: Day 1 escalation
        const eu1 = await escUserEmail();
        if (eu1?.email) sendEscalationReminderEmail(eu1.email, eu1.name, triggerType, 1, userId).catch(() => {});
        await ReminderEscalation.updateOne({ _id: (esc as any)._id }, { day1_sent_at: now });
        results.day1++;
      }
      if (day >= 2 && !e.day2_sent_at) {
        const msg = ESCALATION_MESSAGES[triggerType].day2;
        if (pushPayload && VAPID_PUBLIC && VAPID_PRIVATE) {
          try {
            await webpush.sendNotification(
              { endpoint: pushPayload.endpoint, keys: pushPayload.keys },
              JSON.stringify({ title: msg.title, body: msg.body, tag: `escalation-${triggerType}-2`, data: { type: triggerType } }),
              { TTL: 86400 }
            );
          } catch (err) {
            console.error("Escalation push day2 failed", userId, err);
          }
        }
        await Notification.create({
          user_id: userId,
          title: msg.title,
          message: msg.body,
          category: "reminder",
          related_type: "reminder_escalation",
        });
        // Email: Day 2 escalation
        const eu2 = await escUserEmail();
        if (eu2?.email) sendEscalationReminderEmail(eu2.email, eu2.name, triggerType, 2, userId).catch(() => {});
        await ReminderEscalation.updateOne({ _id: (esc as any)._id }, { day2_sent_at: now });
        results.day2++;
      }
      if (day >= 3 && !e.day3_sent_at) {
        const msg = ESCALATION_MESSAGES[triggerType].day3;
        if (pushPayload && VAPID_PUBLIC && VAPID_PRIVATE) {
          try {
            await webpush.sendNotification(
              { endpoint: pushPayload.endpoint, keys: pushPayload.keys },
              JSON.stringify({
                title: msg.title,
                body: msg.body,
                tag: `escalation-${triggerType}-3`,
                data: { type: triggerType, whatsapp_reminder: true },
              }),
              { TTL: 86400 }
            );
          } catch (err) {
            console.error("Escalation push day3 failed", userId, err);
          }
        }
        await Notification.create({
          user_id: userId,
          title: msg.title,
          message: msg.body,
          category: "reminder",
          related_type: "reminder_escalation",
        });
        // Email: Day 3 escalation (urgent)
        const eu3 = await escUserEmail();
        if (eu3?.email) sendEscalationReminderEmail(eu3.email, eu3.name, triggerType, 3, userId).catch(() => {});
        await ReminderEscalation.updateOne({ _id: (esc as any)._id }, { day3_sent_at: now });
        results.day3++;
      }
      if (day >= 5 && !e.day5_sent_at) {
        const emergencyContact = p.emergency_contact || "Not set";
        const alertType = triggerType === "medication" ? "missed_medication" : "low_adherence";
        const alert = await Alert.create({
          doctor_id,
          patient_id,
          title: `Reminder escalation: ${triggerLabel} not logged for 5 days`,
          description: `${p.full_name || "Patient"} has not logged ${triggerLabel} for 5 days. Consider contacting emergency contact: ${emergencyContact}.`,
          severity: "medium",
          status: "open",
          related_type: "reminder_escalation",
          alert_type: alertType,
        });
        // Email: Day 5 escalation to patient + doctor alert
        const eu5 = await escUserEmail();
        if (eu5?.email) sendEscalationReminderEmail(eu5.email, eu5.name, triggerType, 5, userId).catch(() => {});
        // Email: alert doctor about missed patient
        try {
          const doctorAuth = await AuthUser.findOne({ user_id: doctor_id }).select("email full_name").lean();
          if (doctorAuth && (doctorAuth as any).email) {
            sendDoctorPatientMissedAlertEmail(
              (doctorAuth as any).email,
              (doctorAuth as any).full_name || "Doctor",
              p.full_name || "Patient",
              triggerType,
              5,
              doctor_id
            ).catch(() => {});
          }
        } catch {}
        await ReminderEscalation.updateOne(
          { _id: (esc as any)._id },
          { day5_sent_at: now, day5_alert_id: alert._id?.toString() }
        );
        results.day5++;
      }
    }
  }
  res.json({ ok: true, results });
});

// ──────────── CRON: Daily Health Summary Emails ────────────
router.post("/internal/send-daily-summary-emails", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  let sent = 0;
  try {
    const allPatients = await Patient.find({}).select("_id patient_user_id full_name").lean();
    for (const pat of allPatients as any[]) {
      if (!pat.patient_user_id) continue;
      const authU = await AuthUser.findOne({ user_id: pat.patient_user_id }).select("email full_name").lean();
      if (!authU || !(authU as any).email) continue;
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setUTCHours(23, 59, 59, 999);
      const pid = pat._id.toString();
      const pidFilter = { patient_id: pid };
      const [bpToday, sugarToday, foodToday, medToday] = await Promise.all([
        Vital.countDocuments({ ...pidFilter, vital_type: "blood_pressure", recorded_at: { $gte: startOfDay, $lte: endOfDay } }),
        Vital.countDocuments({ ...pidFilter, vital_type: "blood_sugar", recorded_at: { $gte: startOfDay, $lte: endOfDay } }),
        FoodLog.countDocuments({ ...pidFilter, logged_at: { $gte: startOfDay, $lte: endOfDay } }),
        MedicationLog.countDocuments({ ...pidFilter, logged_at: { $gte: startOfDay, $lte: endOfDay } }),
      ]);
      const gam = await PatientGamification.findOne({ patient_id: pid }).select("current_streak total_points level_label").lean();
      const streakDays = (gam as any)?.current_streak || 0;
      const totalPoints = (gam as any)?.total_points || 0;
      const levelLabel = (gam as any)?.level_label || "Beginner";
      sendDailyHealthSummaryEmail(
        (authU as any).email,
        (authU as any).full_name || pat.full_name || "there",
        { bp: bpToday, sugar: sugarToday, food: foodToday, medication: medToday, streak: streakDays, points: totalPoints, level: levelLabel },
        pat.patient_user_id
      ).catch(() => {});
      sent++;
    }
  } catch (err) {
    console.error("Daily summary email error:", err);
  }
  res.json({ ok: true, sent });
});

// ──────────── CRON: Weekly Doctor Compliance Emails ────────────
router.post("/internal/send-weekly-compliance-emails", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  let sent = 0;
  try {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    weekStart.setUTCHours(0, 0, 0, 0);
    const now = new Date();
    const doctorLinks = await PatientDoctorLink.find({ status: "active" }).lean();
    const doctorMap: Record<string, { doctorUserId: string; patients: { name: string; bp: number; sugar: number; food: number; med: number; streak: number }[] }> = {};
    for (const link of doctorLinks as any[]) {
      const doctorUserId = link.doctor_user_id;
      if (!doctorMap[doctorUserId]) doctorMap[doctorUserId] = { doctorUserId, patients: [] };
      const patient = await Patient.findOne({ patient_user_id: link.patient_user_id }).select("_id full_name").lean();
      if (!patient) continue;
      const pid = (patient as any)._id.toString();
      const pidFilter = { patient_id: pid };
      const [bp, sugar, food, med] = await Promise.all([
        Vital.countDocuments({ ...pidFilter, vital_type: "blood_pressure", recorded_at: { $gte: weekStart, $lte: now } }),
        Vital.countDocuments({ ...pidFilter, vital_type: "blood_sugar", recorded_at: { $gte: weekStart, $lte: now } }),
        FoodLog.countDocuments({ ...pidFilter, logged_at: { $gte: weekStart, $lte: now } }),
        MedicationLog.countDocuments({ ...pidFilter, logged_at: { $gte: weekStart, $lte: now } }),
      ]);
      const gam = await PatientGamification.findOne({ patient_id: pid }).select("current_streak").lean();
      doctorMap[doctorUserId].patients.push({
        name: (patient as any).full_name || "Unknown",
        bp, sugar, food, med,
        streak: (gam as any)?.current_streak || 0,
      });
    }
    for (const docId of Object.keys(doctorMap)) {
      const info = doctorMap[docId];
      if (info.patients.length === 0) continue;
      const doctorAuth = await AuthUser.findOne({ user_id: info.doctorUserId }).select("email full_name").lean();
      if (!doctorAuth || !(doctorAuth as any).email) continue;
      sendWeeklyComplianceEmail(
        (doctorAuth as any).email,
        (doctorAuth as any).full_name || "Doctor",
        info.patients,
        info.doctorUserId
      ).catch(() => {});
      sent++;
    }
  } catch (err) {
    console.error("Weekly compliance email error:", err);
  }
  res.json({ ok: true, sent });
});

// ──────────── CRON: Appointment Reminder Emails (24h before) ────────────
router.post("/internal/send-appointment-reminders", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  let sent = 0;
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const appointments = await Appointment.find({
      status: { $in: ["scheduled", "confirmed"] },
      scheduled_at: { $gte: windowStart, $lte: tomorrow },
    }).lean();
    for (const apt of appointments as any[]) {
      const patient = await Patient.findById(apt.patient_id).select("patient_user_id full_name").lean();
      if (!patient) continue;
      const patientUserId = (patient as any).patient_user_id;
      if (!patientUserId) continue;
      const [patientAuth, doctorAuth] = await Promise.all([
        AuthUser.findOne({ user_id: patientUserId }).select("email full_name").lean(),
        AuthUser.findOne({ user_id: apt.doctor_id }).select("full_name").lean(),
      ]);
      if (patientAuth && (patientAuth as any).email) {
        const dateStr = new Date(apt.scheduled_at).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
        sendAppointmentReminderEmail(
          (patientAuth as any).email,
          (patientAuth as any).full_name || (patient as any).full_name || "there",
          (doctorAuth as any)?.full_name || "Your Doctor",
          dateStr,
          patientUserId
        ).catch(() => {});
        sent++;
      }
    }
  } catch (err) {
    console.error("Appointment reminder email error:", err);
  }
  res.json({ ok: true, sent });
});

// ──────────── CRON: Engagement Automation Processing ────────────
router.post("/internal/process-engagement", async (req, res) => {
  const secret = req.headers["x-cron-secret"] || req.query?.secret;
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { processEngagementAutomation, processCompletionCheck } = await import("../services/engagement.js");
    const [engagement, completed] = await Promise.all([
      processEngagementAutomation(),
      processCompletionCheck(),
    ]);
    res.json({ ok: true, ...engagement, programs_completed: completed });
  } catch (err) {
    console.error("Engagement processing error:", err);
    res.status(500).json({ error: "Engagement processing failed" });
  }
});

const mealUploadDir = path.join(UPLOAD_DIR, "meals");
if (!fs.existsSync(mealUploadDir)) fs.mkdirSync(mealUploadDir, { recursive: true });
const mealUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mealUploadDir),
    filename: (req, file, cb) => {
      const uid = (req as AuthRequest).user?.id || "anon";
      cb(null, `${uid}_${Date.now()}_${(file.originalname || "image").replace(/[^a-zA-Z0-9.-]/g, "_")}`);
    },
  }),
});

const feedbackVideoDir = path.join(UPLOAD_DIR, "feedback_videos");
if (!fs.existsSync(feedbackVideoDir)) fs.mkdirSync(feedbackVideoDir, { recursive: true });
const feedbackVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, feedbackVideoDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${(file.originalname || "video").replace(/[^a-zA-Z0-9.-]/g, "_")}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    const ok = !file.mimetype || file.mimetype.startsWith("video/");
    (cb as (err: Error | null, accept: boolean) => void)(ok ? null : new Error("Only video files are allowed"), ok);
  },
});
router.post("/me/meal-image-upload", requireAuth, mealUpload.single("file"), async (req, res) => {
  const file = (req as any).file;
  if (!file) return res.status(400).json({ error: "file required" });
  res.json({ path: `meals/${file.filename}` });
});

// ---------- Alerts Synchronization Helpers ----------
async function syncPatientStatus(patientId: string) {
  try {
    const hasCritical = await Alert.exists({ patient_id: patientId, status: "open", severity: "critical" });
    const status = hasCritical ? "at_risk" : "active";
    await Patient.updateOne({ _id: patientId }, { $set: { status } });
  } catch (err) {
    console.error("syncPatientStatus error:", err);
  }
}

async function runAlertScanForDoctor(userId: string): Promise<number> {
  let created = 0;
  // Get all active linked patient user IDs
  const links = await PatientDoctorLink.find({ doctor_user_id: userId, status: "active" }).select("patient_user_id").lean();
  const linkedPatientUserIds = [...new Set((links as any[]).map((l) => l.patient_user_id))];

  // Query patients that the doctor owns OR who are linked
  const orConditions: any[] = [{ doctor_id: userId }];
  if (linkedPatientUserIds.length > 0) {
    orConditions.push({ patient_user_id: { $in: linkedPatientUserIds } });
  }
  const patients = await Patient.find({ $or: orConditions }).lean();
  const patientIds = patients.map((p: any) => p._id?.toString());
  const patientMap: Record<string, string> = {};
  patients.forEach((p: any) => { patientMap[p._id?.toString()] = (p as any).full_name || "Patient"; });

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  // 1. Abnormal vitals
  const recentVitals = await Vital.find({ patient_id: { $in: patientIds }, recorded_at: { $gte: sevenDaysAgo } }).lean();
  for (const v of recentVitals as any[]) {
    let isAbnormal = false;
    let detail = "";
    if (v.vital_type === "blood_pressure" && v.value_text) {
      const parts = v.value_text.split("/").map(Number);
      if (parts.length === 2 && (parts[0] > 140 || parts[0] < 90 || parts[1] > 90 || parts[1] < 60)) { isAbnormal = true; detail = `BP ${v.value_text} mmHg`; }
    } else if (v.vital_type === "heart_rate" && v.value_numeric && (v.value_numeric > 100 || v.value_numeric < 50)) { isAbnormal = true; detail = `HR ${v.value_numeric} bpm`; }
    else if (v.vital_type === "blood_sugar" && v.value_numeric && (v.value_numeric > 200 || v.value_numeric < 70)) { isAbnormal = true; detail = `Blood sugar ${v.value_numeric} mg/dL`; }
    else if (v.vital_type === "spo2" && v.value_numeric && v.value_numeric < 92) { isAbnormal = true; detail = `SpO2 ${v.value_numeric}%`; }
    else if (v.vital_type === "temperature" && v.value_numeric && (v.value_numeric > 100.4 || v.value_numeric < 95)) { isAbnormal = true; detail = `Temp ${v.value_numeric}°F`; }
    if (isAbnormal) {
      const exists = await Alert.findOne({ doctor_id: userId, patient_id: v.patient_id, alert_type: "abnormal_vital", related_id: v._id?.toString() }).lean();
      if (!exists) {
        await Alert.create({ doctor_id: userId, patient_id: v.patient_id, alert_type: "abnormal_vital", severity: "critical", title: `Abnormal vital: ${detail}`, description: `${patientMap[v.patient_id] || "Patient"} recorded ${detail}.`, status: "open", related_id: v._id?.toString(), related_type: "vital" });
        await syncPatientStatus(v.patient_id);
        created++;
      }
    }
  }

  // 2. No-show appointments
  const noShows = await Appointment.find({ doctor_id: userId, status: "no_show", scheduled_at: { $gte: sevenDaysAgo } }).lean();
  for (const a of noShows as any[]) {
    const exists = await Alert.findOne({ doctor_id: userId, patient_id: a.patient_id, alert_type: "no_show", related_id: a._id?.toString() }).lean();
    if (!exists) {
      await Alert.create({ doctor_id: userId, patient_id: a.patient_id, alert_type: "no_show", severity: "warning", title: `No-show: ${a.title}`, description: `${patientMap[a.patient_id] || "Patient"} missed "${a.title}".`, status: "open", related_id: a._id?.toString(), related_type: "appointment" });
      created++;
    }
  }

  // 3. Abnormal lab results
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
  const abnormalLabs = await LabResult.find({ patient_id: { $in: patientIds }, status: { $in: ["abnormal", "critical"] }, tested_at: { $gte: fourteenDaysAgo } }).lean();
  for (const lab of abnormalLabs as any[]) {
    const exists = await Alert.findOne({ doctor_id: userId, patient_id: lab.patient_id, related_id: lab._id?.toString() }).lean();
    if (!exists) {
      const isCritical = lab.status === "critical";
      await Alert.create({ doctor_id: userId, patient_id: lab.patient_id, alert_type: "abnormal_vital", severity: isCritical ? "critical" : "warning", title: `Abnormal lab: ${lab.test_name}`, description: `${patientMap[lab.patient_id] || "Patient"} — ${lab.test_name}: ${lab.result_value} ${lab.unit || ""}.`, status: "open", related_id: lab._id?.toString(), related_type: "lab_result" });
      if (isCritical) {
        await syncPatientStatus(lab.patient_id);
      }
      created++;
    }
  }

  return created;
}

// ---------- Alerts ----------
router.get("/alerts", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    await runAlertScanForDoctor(userId);
  } catch (err) {
    console.error("Proactive alert scan failed:", err);
  }
  const q = req.query as { patient_id?: string; status?: string; count?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  if (q.status) filter.status = q.status;
  if (q.count === "true" || q.count === "1") {
    const count = await Alert.countDocuments(filter);
    return res.json({ count });
  }
  const list = await Alert.find(filter).sort({ created_at: -1 }).limit(LIMITS.ALERTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/alerts/scan", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    const created = await runAlertScanForDoctor(userId);
    res.json({ scanned: true, created });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/alerts/:id", requireAuth, async (req, res) => {
  const updated = await Alert.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  if (req.body.status) {
    await syncPatientStatus((updated as any).patient_id);
  }
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Clinical Feedback (Doctor -> Patient) ----------
router.post("/clinical_feedback", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { patient_id, message, rating } = req.body;
  if (!patient_id || !message) return res.status(400).json({ error: "patient_id and message required" });
  const canAccess = await doctorCanAccessPatient(userId, patient_id);
  if (!canAccess) return res.status(403).json({ error: "Not linked to this patient" });
  const patient = await Patient.findById(patient_id).select("patient_user_id full_name").lean() as any;
  if (!patient?.patient_user_id) return res.status(404).json({ error: "Patient not found" });
  const profile = await Profile.findOne({ user_id: userId }).select("full_name").lean() as any;
  const doctorName = profile?.full_name || "Your Doctor";
  await Notification.create({
    user_id: patient.patient_user_id,
    title: `Clinical feedback from Dr. ${doctorName}`,
    message: String(message).trim(),
    type: "info",
    category: "feedback",
    related_id: patient_id,
    related_type: "clinical_feedback",
  });
  res.json({ sent: true });
});

// ---------- Appointments ----------
router.get("/appointments", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string; doctor_id?: string; clinic_id?: string };
  const filter: Record<string, string | { $in: string[] }> = {};
  const asClinicId = await getClinicIdForUser(userId);
  const clinicId = q.clinic_id || (asClinicId ? asClinicId : null);
  if (clinicId) {
    const ok = await canActForClinic(userId, clinicId);
    if (!ok) return res.status(403).json({ error: "Not allowed" });
    filter.clinic_id = clinicId;
  } else {
    if (q.patient_id) {
      const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
      if (!canAccess) return res.status(404).json({ error: "Patient not found" });
      filter.patient_id = q.patient_id;
    } else {
      filter.doctor_id = userId;
    }
  }
  const list = await Appointment.find(filter).sort({ scheduled_at: -1 }).limit(LIMITS.APPOINTMENTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/appointments", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await Appointment.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/appointments/:id", requireAuth, async (req, res) => {
  const prev = await Appointment.findOne({ _id: req.params.id, doctor_id: (req as AuthRequest).user.id }).lean();
  if (!prev) return res.status(404).json({ error: "Not found" });
  const updated = await Appointment.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });

  // When doctor accepts / schedules a requested appointment
  if (req.body.status === "scheduled" && (prev as any).status === "requested") {
    try {
      const patientDoc = await Patient.findOne({ _id: (updated as any).patient_id }).select("patient_user_id").lean();
      if (patientDoc && (patientDoc as any).patient_user_id) {
        const pAuth = await AuthUser.findOne({ user_id: (patientDoc as any).patient_user_id }).select("email full_name").lean();
        if (pAuth && (pAuth as any).email) {
          const dateStr = new Date((updated as any).scheduled_at).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
          sendAppointmentBookedEmail((pAuth as any).email, (pAuth as any).full_name || "there", (updated as any).title, dateStr, (patientDoc as any).patient_user_id).catch(() => {});
        }
      }
    } catch {}
  }

  // When doctor declines / cancels a requested appointment
  if (req.body.status === "cancelled" && (prev as any).status === "requested") {
    try {
      const patientDoc = await Patient.findOne({ _id: (updated as any).patient_id }).select("patient_user_id").lean();
      if (patientDoc && (patientDoc as any).patient_user_id) {
        const pAuth = await AuthUser.findOne({ user_id: (patientDoc as any).patient_user_id }).select("email full_name").lean();
        if (pAuth && (pAuth as any).email) {
          const dateStr = new Date((updated as any).scheduled_at).toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
          sendAppointmentDeclinedEmail((pAuth as any).email, (pAuth as any).full_name || "there", (updated as any).title, dateStr, (patientDoc as any).patient_user_id).catch(() => {});
        }
      }
    } catch {}
  }

  // When doctor marks appointment completed, create feedback request and notify patient
  if (req.body.status === "completed" && (prev as any).status !== "completed") {
    const patientDoc = await Patient.findOne({ _id: (updated as any).patient_id }).select("patient_user_id full_name").lean();
    const patientUserId = (patientDoc as any)?.patient_user_id;
    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await FeedbackRequest.create({
      appointment_id: (updated as any)._id.toString(),
      clinic_id: (updated as any).clinic_id || undefined,
      doctor_id: (updated as any).doctor_id,
      patient_id: (updated as any).patient_id.toString(),
      patient_user_id: patientUserId || undefined,
      expires_at: expiresAt,
      token,
      status: "pending",
    });
    if (patientUserId) {
      await Notification.create({
        user_id: patientUserId,
        title: "Share your feedback",
        message: "Your recent appointment was completed. We'd love to hear about your experience with the doctor and clinic.",
        related_id: (updated as any)._id.toString(),
        related_type: "appointment",
        category: "feedback",
      });
      // Email: appointment completed
      try {
        const [patientAuth, doctorAuth] = await Promise.all([
          AuthUser.findOne({ user_id: patientUserId }).select("email full_name").lean(),
          AuthUser.findOne({ user_id: (req as AuthRequest).user.id }).select("full_name").lean(),
        ]);
        if (patientAuth && (patientAuth as any).email) {
          sendAppointmentCompletedEmail(
            (patientAuth as any).email,
            (patientAuth as any).full_name || (patientDoc as any)?.full_name || "there",
            (updated as any).title || "Appointment",
            (doctorAuth as any)?.full_name || "Your Doctor",
            patientUserId
          ).catch(() => {});
        }
      } catch {}
    }
  }
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Appointment checkins ----------
router.get("/appointment_checkins", requireAuth, async (req, res) => {
  const q = req.query as { patient_id?: string };
  const filter: Record<string, string> = { doctor_id: (req as AuthRequest).user.id };
  if (q.patient_id) filter.patient_id = q.patient_id;
  const list = await AppointmentCheckin.find(filter).sort({ checked_in_at: -1 }).limit(LIMITS.APPOINTMENT_CHECKINS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/appointment_checkins", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await AppointmentCheckin.create(body);
  res.status(201).json(doc.toJSON());
});

// ---------- Clinics ----------
router.get("/clinics", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const asClinicId = await getClinicIdForUser(userId);
  if (asClinicId) {
    const clinic = await Clinic.findById(asClinicId).lean();
    if (!clinic) return res.json([]);
    return res.json([{ ...clinic, id: (clinic as any)._id?.toString(), _id: undefined, __v: undefined }]);
  }
  const members = await ClinicMember.find({ user_id: userId }).lean();
  const clinicIds = (members as { clinic_id: string }[]).map((m) => m.clinic_id);
  const clinics = await Clinic.find({ _id: { $in: clinicIds } }).lean();
  const list = (clinics as any[]).map((c) => ({ ...c, id: c._id?.toString(), _id: undefined, __v: undefined }));
  res.json(list);
});

router.get("/clinics/:id", requireAuth, async (req, res) => {
  const ok = await canActForClinic((req as AuthRequest).user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  const clinic = await Clinic.findById(req.params.id).lean();
  if (!clinic) return res.status(404).json({ error: "Not found" });
  res.json({ ...clinic, id: clinic._id?.toString(), _id: undefined, __v: undefined });
});

router.post("/clinics", requireAuth, async (req, res) => {
  const body = { ...req.body, created_by: (req as AuthRequest).user.id };
  const doc = await Clinic.create(body);
  const clinicId = doc._id.toString();
  await ClinicMember.create({
    clinic_id: clinicId,
    user_id: (req as AuthRequest).user.id,
    role: "owner",
  });
  res.status(201).json(doc.toJSON());
});

router.patch("/clinics/:id", requireAuth, async (req, res) => {
  const ok = await canActForClinic((req as AuthRequest).user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Not found" });
  const updated = await Clinic.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

router.post("/clinics/:id/add-by-doctor-code", requireAuth, async (req, res) => {
  const ok = await canActForClinic((req as AuthRequest).user.id, req.params.id);
  if (!ok) return res.status(403).json({ error: "Not allowed to add members to this clinic" });
  const { doctor_code, role } = req.body as { doctor_code?: string; role?: string };
  if (!doctor_code || String(doctor_code).trim() === "") return res.status(400).json({ error: "doctor_code required" });
  const profile = await Profile.findOne({ doctor_code: String(doctor_code).trim().toUpperCase() }).select("user_id").lean();
  if (!profile) return res.status(404).json({ error: "Doctor not found with this code" });
  const doctorUserId = (profile as { user_id: string }).user_id;
  const roleDoc = await UserRole.findOne({ user_id: doctorUserId }).lean();
  if ((roleDoc as { role?: string })?.role !== "doctor") return res.status(400).json({ error: "This code belongs to a non-doctor account. Only doctors can be added by code." });
  const existing = await ClinicMember.findOne({ clinic_id: req.params.id, user_id: doctorUserId }).lean();
  if (existing) return res.status(409).json({ error: "This doctor is already a member of the clinic" });
  const memberRole = role === "nurse" || role === "admin" || role === "staff" ? role : "doctor";
  await ClinicMember.create({ clinic_id: req.params.id, user_id: doctorUserId, role: memberRole });
  return res.status(201).json({ message: "Doctor added to clinic", user_id: doctorUserId, role: memberRole });
});

router.get("/clinics/:id/has-login", requireAuth, async (req, res) => {
  const ok = await canActForClinic((req as AuthRequest).user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: "Clinic not found" });
  const existing = await AuthUser.findOne({ clinic_id: req.params.id }).lean();
  return res.json({ hasLogin: !!existing });
});

router.post("/clinics/:id/create-login", requireAuth, async (req, res) => {
  const member = await ClinicMember.findOne({ clinic_id: req.params.id, user_id: (req as AuthRequest).user.id }).lean();
  if (!member) return res.status(404).json({ error: "Clinic not found" });
  const role = (member as { role?: string }).role;
  if (role !== "owner" && role !== "admin") {
    return res.status(403).json({ error: "Only clinic owner or admin can create clinic login" });
  }
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });
  const existingEmail = await AuthUser.findOne({ email: (email as string).toLowerCase() }).lean();
  if (existingEmail) return res.status(400).json({ error: "Email already registered" });
  const existingClinicLogin = await AuthUser.findOne({ clinic_id: req.params.id }).lean();
  if (existingClinicLogin) return res.status(409).json({ error: "This clinic already has a login. Use a different clinic or contact support." });
  const clinic = await Clinic.findById(req.params.id).lean();
  if (!clinic) return res.status(404).json({ error: "Clinic not found" });
  const user_id = crypto.randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  await AuthUser.create({
    email: (email as string).toLowerCase(),
    password_hash,
    user_id,
    clinic_id: req.params.id,
  });
  await Profile.create({ user_id, full_name: (clinic as any).name || "Clinic" });
  await UserRole.create({ user_id, role: "clinic", clinic_id: req.params.id });
  return res.status(201).json({ message: "Clinic login created. You can now sign in with this email.", email: (email as string).toLowerCase() });
});

// ---------- Clinic: assigned programs ----------
router.get("/clinic/programs", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  const clinicId = (roleDoc as any)?.clinic_id;
  if (!clinicId) return res.json([]);

  const { ProgramAssignment, DoctorProgramAssignment } = await import("../models/index.js");
  const assignments = await ProgramAssignment.find({ clinic_id: clinicId, status: "active" }).lean();
  const programIds = assignments.map((a: any) => a.program_id);
  if (!programIds.length) return res.json([]);

  // Auto-enroll the actual clinic owner (ClinicMember with role "owner") in all programs.
  // The ClinicMember owner may be a separate doctor account from the clinic login account.
  const ownerMember = await ClinicMember.findOne({ clinic_id: clinicId, role: "owner" }).lean();
  const ownerDoctorId = (ownerMember as any)?.user_id || userId;

  for (const pid of programIds) {
    // If owner is a separate account, clean up stale assignments for the clinic account
    if (ownerDoctorId !== userId) {
      await DoctorProgramAssignment.updateMany(
        { program_id: pid, doctor_user_id: userId, clinic_id: clinicId, status: "active" },
        { $set: { status: "revoked" } }
      ).catch(() => {});
    }
    const exists = await DoctorProgramAssignment.findOne({
      program_id: pid, doctor_user_id: ownerDoctorId, clinic_id: clinicId, status: "active",
    }).lean();
    if (!exists) {
      await DoctorProgramAssignment.create({
        program_id: pid, doctor_user_id: ownerDoctorId, clinic_id: clinicId, assigned_by: "system",
      }).catch(() => {});
    }
  }

  const programs = await Program.find({ _id: { $in: programIds }, is_active: true }).lean();
  const result = programs.map((p: any) => ({
    ...p,
    id: p._id?.toString(),
    _id: undefined,
    __v: undefined,
  }));
  res.json(result);
});

// ---------- Clinic: revenue ----------
router.get("/clinic/revenue", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  const clinicId = (roleDoc as any)?.clinic_id;
  if (!clinicId) return res.json({ total: 0, entries: [] });

  const { RevenueEntry } = await import("../models/index.js");
  const entries = await RevenueEntry.find({ clinic_id: clinicId }).sort({ entry_date: -1 }).lean();
  const total = entries.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

  const byMonth: Record<string, number> = {};
  entries.forEach((e: any) => {
    const d = new Date(e.entry_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] || 0) + (e.amount || 0);
  });

  res.json({
    total,
    entry_count: entries.length,
    by_month: byMonth,
    entries: entries.slice(0, 50).map((e: any) => ({
      ...e,
      id: e._id?.toString(),
      _id: undefined,
      __v: undefined,
    })),
  });
});

router.post("/clinic/revenue", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  const clinicId = (roleDoc as any)?.clinic_id;
  if (!clinicId) return res.status(403).json({ error: "Clinic access required" });

  const { RevenueEntry } = await import("../models/index.js");
  const { amount, description, program_id, doctor_id, patient_id, entry_date } = req.body as any;
  if (!amount) return res.status(400).json({ error: "Amount is required" });

  const entry = await RevenueEntry.create({
    clinic_id: clinicId,
    amount,
    description,
    program_id,
    doctor_id,
    patient_id,
    entered_by: userId,
    entry_date: entry_date ? new Date(entry_date) : new Date(),
  });
  res.status(201).json(entry);
});

// ---------- Clinic: doctor program assignments ----------

/** Clinic lists doctors in their team */
router.get("/clinic/doctors", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.json([]);

  const members = await ClinicMember.find({ clinic_id: clinicId, role: "doctor" }).lean();
  const doctorUserIds = members.map((m: any) => m.user_id);
  if (!doctorUserIds.length) return res.json([]);

  const [profiles, authUsers] = await Promise.all([
    Profile.find({ user_id: { $in: doctorUserIds } }).lean(),
    AuthUser.find({ user_id: { $in: doctorUserIds } }).select("user_id email").lean(),
  ]);
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
  const authMap = new Map(authUsers.map((a: any) => [a.user_id, a]));

  res.json(doctorUserIds.map((uid: string) => ({
    user_id: uid,
    name: (profileMap.get(uid) as any)?.full_name || "Unknown",
    email: (authMap.get(uid) as any)?.email || "",
    specialization: (profileMap.get(uid) as any)?.specialization || "",
  })));
});

/** Clinic assigns a doctor to a program */
router.post("/clinic/programs/:programId/assign-doctor", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Clinic access required" });

  const { doctor_user_id } = req.body as any;
  if (!doctor_user_id) return res.status(400).json({ error: "doctor_user_id is required" });

  const { DoctorProgramAssignment } = await import("../models/index.js");
  const existing = await DoctorProgramAssignment.findOne({
    program_id: req.params.programId, doctor_user_id, clinic_id: clinicId, status: "active",
  }).lean();
  if (existing) return res.status(400).json({ error: "Doctor already assigned to this program" });

  const assignment = await DoctorProgramAssignment.create({
    program_id: req.params.programId,
    doctor_user_id,
    clinic_id: clinicId,
    assigned_by: userId,
  });
  res.status(201).json(assignment);
});

/** Clinic removes a doctor from a program */
router.delete("/clinic/programs/:programId/assign-doctor/:doctorUserId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Clinic access required" });

  const { DoctorProgramAssignment } = await import("../models/index.js");
  await DoctorProgramAssignment.updateOne(
    { program_id: req.params.programId, doctor_user_id: req.params.doctorUserId, clinic_id: clinicId, status: "active" },
    { $set: { status: "revoked" } }
  );
  res.json({ success: true });
});

/** Clinic lists doctor assignments for a program */
router.get("/clinic/programs/:programId/doctors", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.json([]);

  // Find the actual clinic owner from ClinicMember (may be a separate doctor account)
  const ownerMember = await ClinicMember.findOne({ clinic_id: clinicId, role: "owner" }).lean();
  const ownerDoctorId = (ownerMember as any)?.user_id;
  // Fallback: clinic account user_id (from UserRole)
  const clinicRole = await UserRole.findOne({ clinic_id: clinicId, role: "clinic" }).lean();
  const clinicAccountId = (clinicRole as any)?.user_id || userId;

  const { DoctorProgramAssignment } = await import("../models/index.js");
  const assignments = await DoctorProgramAssignment.find({
    program_id: req.params.programId, clinic_id: clinicId, status: "active",
  }).lean();
  const doctorIds = assignments.map((a: any) => a.doctor_user_id);
  if (!doctorIds.length) return res.json([]);

  const [profiles, authUsers] = await Promise.all([
    Profile.find({ user_id: { $in: doctorIds } }).lean(),
    AuthUser.find({ user_id: { $in: doctorIds } }).select("user_id email").lean(),
  ]);
  const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
  const authMap = new Map(authUsers.map((a: any) => [a.user_id, a]));

  res.json(assignments.map((a: any) => {
    const isOwner = a.doctor_user_id === ownerDoctorId || a.doctor_user_id === clinicAccountId;
    const profile = profileMap.get(a.doctor_user_id) as any;
    const doctorName = profile?.full_name || (authMap.get(a.doctor_user_id) as any)?.email?.split("@")[0] || "Unknown";
    return {
      id: a._id?.toString(),
      doctor_user_id: a.doctor_user_id,
      doctor_name: isOwner ? `${doctorName} (Owner)` : doctorName,
      assigned_at: a.assigned_at,
      is_owner: isOwner,
    };
  }));
});

// ---------- Doctor: view assigned programs ----------

/** Doctor sees programs assigned to them. Clinic owners see all clinic programs. */
router.get("/doctor/programs", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;

  const { DoctorProgramAssignment, ProgramAssignment } = await import("../models/index.js");

  // Collect program IDs from direct doctor assignments (DoctorProgramAssignment)
  const doctorAssignments = await DoctorProgramAssignment.find({ doctor_user_id: userId, status: "active" }).lean();
  const programIdSet = new Set(doctorAssignments.map((a: any) => a.program_id));

  // If user is a clinic owner (UserRole "clinic"), also include all programs assigned to their clinic
  const roleDoc = await UserRole.findOne({ user_id: userId }).lean();
  if ((roleDoc as any)?.role === "clinic" && (roleDoc as any)?.clinic_id) {
    const clinicAssignments = await ProgramAssignment.find({
      clinic_id: (roleDoc as any).clinic_id, status: "active",
    }).lean();
    clinicAssignments.forEach((a: any) => programIdSet.add(a.program_id));
  }

  // Also check if this user is a ClinicMember (owner/doctor) — they may have
  // a separate doctor account linked to a clinic. Include programs from those clinics.
  const memberships = await ClinicMember.find({
    user_id: userId, role: { $in: ["owner", "doctor"] },
  }).lean();
  if (memberships.length) {
    const clinicIds = memberships.map((m: any) => m.clinic_id);
    const clinicAssignments = await ProgramAssignment.find({
      clinic_id: { $in: clinicIds }, status: "active",
    }).lean();
    clinicAssignments.forEach((a: any) => programIdSet.add(a.program_id));
  }

  const programIds = [...programIdSet];
  if (!programIds.length) return res.json([]);

  const programs = await Program.find({ _id: { $in: programIds }, is_active: true }).lean();
  res.json(programs.map((p: any) => ({
    ...p,
    id: p._id?.toString(),
    _id: undefined,
    __v: undefined,
  })));
});

// ---------- Clinic members ----------
router.get("/clinic_members", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { clinic_id?: string };
  const asClinicId = await getClinicIdForUser(userId);
  const filter: Record<string, string | { $in: string[] }> = {};
  if (asClinicId) filter.clinic_id = asClinicId;
  else if (q.clinic_id) filter.clinic_id = q.clinic_id;
  else {
    const members = await ClinicMember.find({ user_id: userId }).select("clinic_id").lean();
    filter.clinic_id = { $in: members.map((m: { clinic_id: string }) => m.clinic_id) };
  }
  const list = await ClinicMember.find(filter).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/clinic_members", requireAuth, async (req, res) => {
  const body = req.body as { clinic_id: string; user_id: string; role?: string };
  if (!body.clinic_id || !body.user_id) return res.status(400).json({ error: "clinic_id and user_id required" });
  const ok = await canActForClinic((req as AuthRequest).user.id, body.clinic_id);
  if (!ok) return res.status(403).json({ error: "Not allowed to add members to this clinic" });
  const doc = await ClinicMember.create({ ...body, role: body.role || "doctor" });
  res.status(201).json(doc.toJSON());
});

// ---------- Clinic invites ----------
router.get("/clinic_invites", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { clinic_id?: string };
  const asClinicId = await getClinicIdForUser(userId);
  const filter: Record<string, unknown> = {};
  if (asClinicId) filter.clinic_id = asClinicId;
  else if (q.clinic_id) filter.clinic_id = q.clinic_id;
  else return res.json([]);
  const list = await ClinicInvite.find(filter).sort({ created_at: -1 }).limit(200).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/clinic_invites", requireAuth, async (req, res) => {
  const body = req.body as { clinic_id: string; email: string; role?: string };
  if (!body.clinic_id || !body.email) return res.status(400).json({ error: "clinic_id and email required" });
  const ok = await canActForClinic((req as AuthRequest).user.id, body.clinic_id);
  if (!ok) return res.status(403).json({ error: "Not allowed to invite to this clinic" });
  const doc = await ClinicInvite.create({ ...body, invited_by: (req as AuthRequest).user.id, invite_code: crypto.randomBytes(4).toString("hex").toUpperCase(), role: body.role || "doctor" });
  res.status(201).json(doc.toJSON());
});

router.patch("/clinic_invites/:id", requireAuth, async (req, res) => {
  const updated = await ClinicInvite.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Doctor availability ----------
router.get("/doctor_availability", requireAuth, async (req, res) => {
  const q = req.query as { doctor_id?: string; clinic_id?: string };
  const filter: Record<string, string> = { doctor_id: (req as AuthRequest).user.id };
  if (q.clinic_id) filter.clinic_id = q.clinic_id;
  const list = await DoctorAvailability.find(filter).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/doctor_availability", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await DoctorAvailability.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/doctor_availability/:id", requireAuth, async (req, res) => {
  const updated = await DoctorAvailability.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

router.delete("/doctor_availability/:id", requireAuth, async (req, res) => {
  const deleted = await DoctorAvailability.findOneAndDelete({ _id: req.params.id, doctor_id: (req as AuthRequest).user.id });
  if (!deleted) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

// ---------- Enrollments ----------
router.get("/enrollments", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  const list = await Enrollment.find(filter).sort({ enrolled_at: -1 }).limit(LIMITS.ENROLLMENTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/enrollments", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await Enrollment.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/enrollments/:id", requireAuth, async (req, res) => {
  const updated = await Enrollment.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Feedback requests ----------
router.get("/feedback_requests", requireAuth, async (req, res) => {
  const q = req.query as { token?: string };
  const filter: Record<string, string> = {};
  if (q.token) filter.token = q.token;
  const list = await FeedbackRequest.find(filter).limit(LIMITS.FEEDBACK_REQUESTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

// Patient: list my pending feedback requests (for completed appointments)
router.get("/me/feedback_requests", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const now = new Date();
  const list = await FeedbackRequest.find({
    patient_user_id: userId,
    status: "pending",
    expires_at: { $gt: now },
  })
    .sort({ created_at: -1 })
    .limit(LIMITS.FEEDBACK_REQUESTS_MAX)
    .lean();
  if (list.length === 0) return res.json([]);
  const doctorIds = [...new Set((list as any[]).map((r) => r.doctor_id))];
  const clinicIds = [...new Set((list as any[]).map((r) => r.clinic_id).filter(Boolean))];
  const [profiles, clinics, appts] = await Promise.all([
    Profile.find({ user_id: { $in: doctorIds } }).select("user_id full_name").lean(),
    clinicIds.length ? Clinic.find({ _id: { $in: clinicIds } }).select("_id name").lean() : [],
    Appointment.find({ _id: { $in: (list as any[]).map((r) => r.appointment_id) } }).select("_id title scheduled_at").lean(),
  ]);
  const nameByDoctor: Record<string, string> = {};
  for (const p of profiles as { user_id: string; full_name?: string }[]) nameByDoctor[p.user_id] = p.full_name || "Doctor";
  const nameByClinic: Record<string, string> = {};
  for (const c of clinics as { _id: unknown; name?: string }[]) nameByClinic[(c as any)._id?.toString()] = c.name || "Clinic";
  const apptById: Record<string, { title?: string; scheduled_at?: Date }> = {};
  for (const a of appts as any[]) apptById[a._id?.toString()] = { title: a.title, scheduled_at: a.scheduled_at };
  const out = (list as any[]).map((r) => ({
    ...r,
    id: r._id?.toString(),
    _id: undefined,
    __v: undefined,
    doctor_name: nameByDoctor[r.doctor_id] || "Doctor",
    clinic_name: r.clinic_id ? nameByClinic[r.clinic_id] : null,
    appointment_title: apptById[r.appointment_id]?.title,
    scheduled_at: apptById[r.appointment_id]?.scheduled_at,
  }));
  res.json(out);
});

// Get a single feedback request by token (for feedback form link; optional auth)
router.get("/feedback_requests/by_token/:token", optionalAuth, async (req, res) => {
  const reqDoc = await FeedbackRequest.findOne({ token: req.params.token, status: "pending" }).lean();
  if (!reqDoc) return res.status(404).json({ error: "Feedback request not found or already submitted" });
  const r = reqDoc as any;
  if (r.expires_at && new Date(r.expires_at) < new Date()) return res.status(410).json({ error: "Feedback request has expired" });
  const [doctorProfile, clinic, appt] = await Promise.all([
    Profile.findOne({ user_id: r.doctor_id }).select("full_name").lean(),
    r.clinic_id ? Clinic.findById(r.clinic_id).select("name").lean() : null,
    Appointment.findById(r.appointment_id).select("title scheduled_at").lean(),
  ]);
  res.json({
    id: r._id?.toString(),
    token: r.token,
    doctor_name: (doctorProfile as any)?.full_name || "Doctor",
    clinic_name: (clinic as any)?.name || null,
    appointment_title: (appt as any)?.title,
    scheduled_at: (appt as any)?.scheduled_at,
    has_clinic: !!r.clinic_id,
  });
});

// Patient: submit feedback (authenticated; multipart with optional video file)
router.post("/me/feedbacks", requireAuth, feedbackVideoUpload.single("video"), async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const body = req.body as Record<string, string | undefined>;
  const doctorRating = body.doctor_rating != null ? parseInt(String(body.doctor_rating), 10) : NaN;
  if (!Number.isFinite(doctorRating) || doctorRating < 1 || doctorRating > 5) {
    return res.status(400).json({ error: "doctor_rating required (1-5)" });
  }
  let reqDoc = null;
  if (body.feedback_request_id) {
    reqDoc = await FeedbackRequest.findOne({ _id: body.feedback_request_id, patient_user_id: userId }).lean();
  } else if (body.token) {
    reqDoc = await FeedbackRequest.findOne({ token: body.token, patient_user_id: userId }).lean();
  }
  if (!reqDoc) return res.status(404).json({ error: "Feedback request not found or not yours" });
  const r = reqDoc as any;
  if (r.status !== "pending") return res.status(400).json({ error: "Feedback already submitted" });
  if (r.expires_at && new Date(r.expires_at) < new Date()) return res.status(410).json({ error: "Feedback request has expired" });
  const file = (req as any).file;
  const videoPath = file ? `feedback_videos/${file.filename}` : undefined;
  const clinicRating = body.clinic_rating != null && body.clinic_rating !== "" ? parseInt(String(body.clinic_rating), 10) : undefined;
  const doc = await Feedback.create({
    appointment_id: r.appointment_id,
    clinic_id: r.clinic_id || undefined,
    doctor_id: r.doctor_id,
    doctor_rating: doctorRating,
    clinic_rating: Number.isFinite(clinicRating) ? clinicRating : undefined,
    feedback_request_id: r._id.toString(),
    patient_id: r.patient_id,
    review_text: (body.review_text && String(body.review_text).trim()) || undefined,
    video_url: undefined,
    video_path: videoPath,
    consent_to_publish: body.consent_to_publish === "true" || body.consent_to_publish === "1",
    is_testimonial: body.is_testimonial === "true" || body.is_testimonial === "1",
  });
  await FeedbackRequest.updateOne({ _id: r._id }, { status: "submitted", submitted_at: new Date() });
  res.status(201).json(doc.toJSON());
});

// ---------- Feedbacks ----------
// Doctor: feedbacks for my practice. Clinic: feedbacks for clinic_id (when user can act for clinic).
// When clinic_id is requested, include feedbacks that have that clinic_id OR feedbacks with no clinic_id where the doctor is a member of the clinic.
router.get("/feedbacks", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { clinic_id?: string; is_testimonial?: string; doctor_id?: string };
  const filter: Record<string, unknown> = {};
  if (q.clinic_id) {
    const ok = await canActForClinic(userId, q.clinic_id);
    if (!ok) return res.status(403).json({ error: "Not allowed to view this clinic's feedback" });
    const clinicDoctorIds = await ClinicMember.find({ clinic_id: q.clinic_id }).distinct("user_id");
    filter.$or = [
      { clinic_id: q.clinic_id },
      { doctor_id: { $in: clinicDoctorIds }, $or: [{ clinic_id: null }, { clinic_id: "" }, { clinic_id: { $exists: false } }] },
    ];
  } else if (q.doctor_id) {
    // Only allow if current user is that doctor or can act for a clinic that includes that doctor
    if (q.doctor_id !== userId) {
      const clinicId = await getClinicIdForUser(userId);
      if (clinicId) {
        const member = await ClinicMember.findOne({ clinic_id: clinicId, user_id: q.doctor_id }).lean();
        if (!member) return res.status(403).json({ error: "Not allowed" });
      } else return res.status(403).json({ error: "Not allowed" });
    }
    filter.doctor_id = q.doctor_id;
  } else {
    filter.doctor_id = userId;
  }
  if (q.is_testimonial === "true") filter.is_testimonial = true;
  const list = await Feedback.find(filter).sort({ created_at: -1 }).lean();
  const withNames = list as any[];
  if (withNames.length > 0) {
    const doctorIds = [...new Set(withNames.map((d) => d.doctor_id))];
    const profiles = await Profile.find({ user_id: { $in: doctorIds } }).select("user_id full_name").lean();
    const nameByDoctor: Record<string, string> = {};
    for (const p of profiles as { user_id: string; full_name?: string }[]) nameByDoctor[p.user_id] = p.full_name || "Doctor";
    const out = withNames.map((d) => ({
      ...d,
      id: d._id?.toString(),
      _id: undefined,
      __v: undefined,
      doctor_name: nameByDoctor[d.doctor_id] || "Doctor",
    }));
    return res.json(out);
  }
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

// Serve uploaded feedback video (doctor or clinic with access)
router.get("/feedbacks/:id/video", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const fb = await Feedback.findById(req.params.id).lean();
  if (!fb || !(fb as any).video_path) return res.status(404).json({ error: "Not found" });
  const f = fb as any;
  let allowed = f.doctor_id === userId;
  if (!allowed && f.clinic_id) {
    allowed = await canActForClinic(userId, f.clinic_id);
  }
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const filePath = path.join(UPLOAD_DIR, f.video_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  res.sendFile(filePath, { headers: { "Content-Disposition": "inline" } });
});

router.post("/feedbacks", requireAuth, async (req, res) => {
  const doc = await Feedback.create(req.body);
  res.status(201).json(doc.toJSON());
});

// ---------- Food logs ----------
router.get("/food_logs", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string; count?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  if (q.count === "true" || q.count === "1") {
    const count = await FoodLog.countDocuments(filter);
    return res.json({ count });
  }
  const list = await FoodLog.find(filter).sort({ logged_at: -1 }).limit(LIMITS.FOOD_LOGS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/food_logs", requireAuth, async (req, res) => {
  const doctorId = (req as AuthRequest).user.id;
  const { patient_id, meal_type, raw_message, source, notes } = req.body;
  if (!patient_id) return res.status(400).json({ error: "patient_id required" });

  const geminiKey = process.env.GEMINI_API_KEY;
  const descriptionText = (raw_message || notes || "").trim();
  let food_items: any[] = [];
  let total_calories: number | undefined;
  let total_protein: number | undefined;
  let total_carbs: number | undefined;
  let total_fat: number | undefined;

  const needsAI = geminiKey && descriptionText;

  if (needsAI) {
    const systemPrompt = `You are a nutrition parser. Analyze the meal and extract food items with accurate nutritional values.
Return ONLY valid JSON: { "food_items": [{ "name": "string", "quantity": number, "unit": "string", "calories": number, "protein": number, "carbs": number, "fat": number }] }
For Indian foods use common serving sizes. Always return valid JSON only.`;

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: `Meal type: ${meal_type || "other"}\nDescription: ${descriptionText}` }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
          }),
        }
      );
      if (geminiRes.ok) {
        const aiResult = await geminiRes.json();
        const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        try {
          const parsed = JSON.parse(jsonMatch[1]!.trim());
          if (Array.isArray(parsed.food_items) && parsed.food_items.length > 0) {
            food_items = parsed.food_items;
          }
        } catch { /* ignore parse errors */ }
      }
    } catch { /* AI failures are non-blocking */ }
  }

  if (food_items.length > 0) {
    total_calories = food_items.reduce((s, i) => s + (i.calories || 0), 0);
    total_protein  = food_items.reduce((s, i) => s + (i.protein  || 0), 0);
    total_carbs    = food_items.reduce((s, i) => s + (i.carbs    || 0), 0);
    total_fat      = food_items.reduce((s, i) => s + (i.fat      || 0), 0);
  }

  const body = {
    ...req.body,
    doctor_id: doctorId,
    food_items: food_items.length > 0 ? food_items : (req.body?.food_items ?? []),
    ...(total_calories !== undefined && { total_calories, total_protein, total_carbs, total_fat }),
  };
  const doc = await FoodLog.create(body);
  res.status(201).json(doc.toJSON());
});

// ---------- Lab results ----------
router.get("/lab_results", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string; count?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  if (q.count === "true" || q.count === "1") {
    const count = await LabResult.countDocuments(filter);
    return res.json({ count });
  }
  const list = await LabResult.find(filter).sort({ tested_at: -1 }).limit(LIMITS.LAB_RESULTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/lab_results/upload-report", requireAuth, upload.single("file"), async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "Lab report AI is not configured (GEMINI_API_KEY)" });
  const file = (req as any).file;
  const patientId = req.body?.patient_id;
  if (!file || !patientId) return res.status(400).json({ error: "file and patient_id required" });
  const userId = (req as AuthRequest).user.id;
  const canAccess = await doctorCanAccessPatient(userId, patientId);
  if (!canAccess) return res.status(404).json({ error: "Patient not found" });
  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) return res.status(400).json({ error: "Only image (JPEG, PNG, WebP) or PDF files are supported" });
  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const extracted = isPdf
      ? await extractLabResultsFromPdf(GEMINI_API_KEY, buf, file.originalname || file.filename)
      : await extractLabResultsFromImage(GEMINI_API_KEY, buf.toString("base64"), mime);
    if (!extracted.results?.length) return res.status(422).json({ error: "No lab values could be read from the file. Try a clearer image or PDF." });
    const analysis = await analyzeLabResultsForReport(GEMINI_API_KEY, extracted.results);
    const testedAt = extracted.tested_at ? new Date(extracted.tested_at) : new Date();
    const reportDoc = await LabReport.create({
      patient_id: patientId,
      doctor_id: userId,
      uploaded_by: userId,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_type: mime,
      tested_at: testedAt,
      ai_summary: analysis.ai_summary || null,
      layman_summary: analysis.layman_summary || null,
      extracted_data: (analysis.key_points?.length || analysis.charts?.length) ? { key_points: analysis.key_points, charts: analysis.charts } : null,
    });
    const reportId = reportDoc._id;
    const resultsToCreate = extracted.results.map((r: { test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }) => ({
      patient_id: patientId,
      doctor_id: userId,
      lab_report_id: reportId,
      test_name: String(r.test_name || "").trim() || "Unknown",
      result_value: String(r.result_value || "").trim(),
      unit: r.unit ? String(r.unit).trim() : null,
      reference_range: r.reference_range ? String(r.reference_range).trim() : null,
      status: r.status === "critical" ? "critical" : r.status === "abnormal" ? "abnormal" : "normal",
      tested_at: testedAt,
    }));
    const created = await LabResult.insertMany(resultsToCreate);
    const reportOut = { ...reportDoc.toObject(), id: reportDoc._id?.toString(), _id: undefined, __v: undefined };
    const resultsOut = created.map((d: any) => ({ ...d.toObject(), id: d._id?.toString(), _id: undefined, __v: undefined, lab_report_id: reportId?.toString() }));
    return res.status(201).json({ report: reportOut, results: resultsOut });
  } catch (e) {
    const err = e as Error;
    return res.status(500).json({ error: err.message || "Lab report processing failed" });
  }
});

router.get("/lab_reports", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string };
  if (!q.patient_id) return res.status(400).json({ error: "patient_id required" });
  const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
  if (!canAccess) return res.status(404).json({ error: "Patient not found" });
  const list = await LabReport.find({ patient_id: q.patient_id }).sort({ tested_at: -1 }).limit(50).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/lab_reports/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const report = await LabReport.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ error: "Not found" });
  const r = report as any;
  const canAccess = await doctorCanAccessPatient(userId, r.patient_id);
  if (!canAccess) return res.status(404).json({ error: "Not found" });
  const results = await LabResult.find({ lab_report_id: r._id }).sort({ test_name: 1 }).lean();
  res.json({
    report: { ...r, id: r._id?.toString(), _id: undefined, __v: undefined },
    results: results.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })),
  });
});

router.get("/lab_reports/:id/file", requireAuth, async (req, res) => {
  const report = await LabReport.findById(req.params.id).lean();
  if (!report) return res.status(404).json({ error: "Not found" });
  const r = report as any;
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ _id: r.patient_id }).select("doctor_id patient_user_id").lean();
  if (!patient) return res.status(404).json({ error: "Not found" });
  const p = patient as { doctor_id: string; patient_user_id?: string };
  let canAccess = r.doctor_id === userId || p.patient_user_id === userId || r.uploaded_by === userId;
  if (!canAccess && p.patient_user_id) {
    const link = await PatientDoctorLink.findOne({ doctor_user_id: userId, patient_user_id: p.patient_user_id, status: "active" }).lean();
    if (link) {
      canAccess = true;
    } else {
      const fam = await FamilyConnection.findOne({ family_user_id: userId, patient_user_id: p.patient_user_id, status: "active" }).lean();
      canAccess = !!fam;
    }
  }
  if (!canAccess) return res.status(403).json({ error: "Forbidden" });
  const filePath = path.join(UPLOAD_DIR, r.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  res.sendFile(filePath, { headers: { "Content-Disposition": `inline; filename="${encodeURIComponent(r.file_name || "report")}"` } });
});

router.post("/lab_results", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  if (!body.tested_at) body.tested_at = new Date();
  const doc = await LabResult.create(body);
  res.status(201).json(doc.toJSON());
});

// ---------- Link requests ----------
router.get("/link_requests", requireAuth, async (req, res) => {
  const list = await LinkRequest.find({ doctor_id: (req as AuthRequest).user.id }).sort({ created_at: -1 }).limit(LIMITS.LINK_REQUESTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/link_requests", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await LinkRequest.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/link_requests/:id", requireAuth, async (req, res) => {
  const doctorId = (req as AuthRequest).user.id;
  const request = await LinkRequest.findOne({ _id: req.params.id, doctor_id: doctorId }).lean();
  if (!request) return res.status(404).json({ error: "Not found" });
  const body = req.body as { status?: string; linked_patient_id?: string; resolved_at?: string };
  if (body.status === "approved") {
    const patientUserId = (request as any).patient_user_id;
    let linkedPatientId = body.linked_patient_id;
    const existingPatient = await Patient.findOne({ patient_user_id: patientUserId }).select("_id full_name phone").lean();
    if (linkedPatientId) {
      const patientDoc = await Patient.findOne({ _id: linkedPatientId, doctor_id: doctorId });
      if (patientDoc && !patientDoc.patient_user_id) {
        (patientDoc as any).patient_user_id = patientUserId;
        await patientDoc.save();
      } else if (!patientDoc) {
        // linked_patient_id is not a record under this doctor; create one so /me/doctors and booking work
        const created = await Patient.create({
          doctor_id: doctorId,
          patient_user_id: patientUserId,
          full_name: (existingPatient as any)?.full_name || (request as any).patient_name || "Patient",
          phone: (existingPatient as any)?.phone || " ",
          status: "active",
        });
        linkedPatientId = created._id.toString();
      }
    } else {
      // No linked_patient_id: create a Patient record under this doctor (don't reuse patient's self-record)
      const created = await Patient.create({
        doctor_id: doctorId,
        patient_user_id: patientUserId,
        full_name: (existingPatient as any)?.full_name || (request as any).patient_name || "Patient",
        phone: (existingPatient as any)?.phone || " ",
        status: "active",
      });
      linkedPatientId = created._id.toString();
    }
    const doctorProfile = await Profile.findOne({ user_id: doctorId }).select("full_name").lean();
    const existingLink = await PatientDoctorLink.findOne({ doctor_user_id: doctorId, patient_user_id: patientUserId }).lean();
    if (!existingLink) {
      await PatientDoctorLink.create({
        doctor_user_id: doctorId,
        patient_user_id: patientUserId,
        doctor_name: (doctorProfile as any)?.full_name || "Doctor",
        status: "active",
        responded_at: new Date(),
      });
    }
    body.linked_patient_id = linkedPatientId;
    if (!body.resolved_at) body.resolved_at = new Date().toISOString();
  }
  const updated = await LinkRequest.findOneAndUpdate(
    { _id: req.params.id, doctor_id: doctorId },
    body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });

  // Notify doctor by email when a patient links (fire-and-forget)
  if (body.status === "approved") {
    try {
      const docAuth = await AuthUser.findOne({ user_id: doctorId }).select("email").lean();
      const docProf = await Profile.findOne({ user_id: doctorId }).select("full_name").lean();
      const patientName = (request as any).patient_name || "A patient";
      if (docAuth && (docAuth as any).email) {
        sendNewPatientLinkedEmail((docAuth as any).email, (docProf as any)?.full_name || "Doctor", patientName, doctorId).catch(() => {});
      }
    } catch {}
  }
});

// ---------- Notifications ----------
router.get("/notifications", requireAuth, async (req, res) => {
  const list = await Notification.find({ user_id: (req as AuthRequest).user.id }).sort({ created_at: -1 }).limit(LIMITS.NOTIFICATIONS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.patch("/notifications/:id", requireAuth, async (req, res) => {
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.id, user_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

router.patch("/notifications/read-all", requireAuth, async (req, res) => {
  await Notification.updateMany({ user_id: (req as AuthRequest).user.id, is_read: false }, { is_read: true });
  res.json({ ok: true });
});

// ---------- Patient doctor links ----------
router.get("/patient_doctor_links", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_user_id?: string; doctor_id?: string };
  const filter: Record<string, string> = {};
  if (q.doctor_id) filter.doctor_user_id = q.doctor_id;
  if (q.patient_user_id) {
    if (q.patient_user_id !== userId) return res.status(403).json({ error: "Forbidden" });
    filter.patient_user_id = q.patient_user_id;
  }
  const list = await PatientDoctorLink.find(filter).limit(500).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/patient_doctor_links", requireAuth, async (req, res) => {
  const body = { ...req.body };
  if (body.status == null || body.status === "") body.status = "pending";
  const doc = await PatientDoctorLink.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/patient_doctor_links/:id", requireAuth, async (req, res) => {
  const updated = await PatientDoctorLink.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Patient vault codes ----------
router.get("/patient_vault_codes", requireAuth, async (req, res) => {
  const q = req.query as { patient_user_id?: string; vault_code?: string };
  const filter: Record<string, string | unknown> = {};
  if (q.patient_user_id) filter.patient_user_id = q.patient_user_id;
  if (q.vault_code) {
    filter.vault_code = String(q.vault_code).trim().toUpperCase();
    filter.is_active = true;
  }
  const list = await PatientVaultCode.find(filter).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

function generateVaultCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.post("/patient_vault_codes", requireAuth, async (req, res) => {
  const body = { ...req.body };
  if (!body.vault_code) body.vault_code = generateVaultCode();
  const doc = await PatientVaultCode.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/patient_vault_codes/:id", requireAuth, async (req, res) => {
  const doc = await PatientVaultCode.findOne({ _id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  if ((doc as any).patient_user_id !== (req as AuthRequest).user.id) return res.status(403).json({ error: "Forbidden" });
  const updated = await PatientVaultCode.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  res.json({ ...updated, id: (updated as any)._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Patient documents ----------
router.get("/patient_documents", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string; count?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  if (q.count === "true" || q.count === "1") {
    const count = await PatientDocument.countDocuments(filter);
    return res.json({ count });
  }
  const list = await PatientDocument.find(filter).sort({ created_at: -1 }).limit(LIMITS.DOCUMENTS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/patient_documents", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await PatientDocument.create(body);
  res.status(201).json(doc.toJSON());
});

router.get("/patient_documents/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const doc = await PatientDocument.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  const d = doc as any;
  const canAccess = await doctorCanAccessPatient(userId, d.patient_id);
  if (!canAccess) return res.status(404).json({ error: "Not found" });
  res.json({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined });
});

router.post("/patient_documents/upload-and-analyze", requireAuth, upload.single("file"), async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "Document analysis is not configured (GEMINI_API_KEY)" });
  const file = (req as any).file;
  const { patient_id, category, notes } = req.body;
  if (!file || !patient_id) return res.status(400).json({ error: "file and patient_id required" });
  const userId = (req as AuthRequest).user.id;
  const canAccess = await doctorCanAccessPatient(userId, patient_id);
  if (!canAccess) return res.status(404).json({ error: "Patient not found" });
  const patient = await Patient.findOne({ _id: patient_id }).select("doctor_id").lean();
  const doctorId = (patient as any).doctor_id;
  const mime = (file.mimetype || "").toLowerCase();
  const isPdf = mime === "application/pdf";
  const isImage = mime.startsWith("image/");
  if (!isImage && !isPdf) return res.status(400).json({ error: "Only image (JPEG, PNG, WebP) or PDF are supported" });
  try {
    const buf = fs.readFileSync(path.join(UPLOAD_DIR, file.filename));
    const analysis = isPdf
      ? await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "pdf", buffer: buf, fileName: file.originalname || file.filename })
      : await analyzeDocumentWithGemini(GEMINI_API_KEY, { type: "image", base64: buf.toString("base64"), mimeType: mime });
    const extractedData: Record<string, unknown> = { key_points: analysis.key_points };
    if (analysis.chart_data) extractedData.chart_data = analysis.chart_data;
    if (analysis.prescription_summary) extractedData.prescription_summary = analysis.prescription_summary;
    if (analysis.medications?.length) extractedData.medications = analysis.medications;
    const doc = await PatientDocument.create({
      patient_id,
      doctor_id: doctorId,
      uploaded_by: userId,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: category || "general",
      notes: notes || null,
      ai_summary: analysis.summary || null,
      layman_summary: analysis.layman_summary || null,
      extracted_data: extractedData,
      analyzed_at: new Date(),
    });
    res.status(201).json(doc.toJSON());
  } catch {
    const doc = await PatientDocument.create({
      patient_id,
      doctor_id: doctorId,
      uploaded_by: userId,
      file_name: file.originalname || file.filename,
      file_path: file.filename,
      file_size_bytes: file.size,
      file_type: mime,
      category: category || "general",
      notes: notes || null,
    });
    res.status(201).json(doc.toJSON());
  }
});

router.post("/patient_documents/upload", requireAuth, upload.single("file"), async (req, res) => {
  const file = (req as any).file;
  const { patient_id, category, notes } = req.body;
  if (!file || !patient_id) return res.status(400).json({ error: "file and patient_id required" });
  const patient = await Patient.findOne({ _id: patient_id }).select("doctor_id").lean();
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const doctorId = (patient as any).doctor_id;
  const file_path = file.filename;
  const doc = await PatientDocument.create({
    patient_id,
    doctor_id: doctorId,
    uploaded_by: (req as AuthRequest).user.id,
    file_name: file.originalname || file_path,
    file_path,
    file_size_bytes: file.size,
    file_type: file.mimetype,
    category: category || "general",
    notes: notes || null,
  });
  res.status(201).json(doc.toJSON());
});

router.get("/patient_documents/:id/file", requireAuth, async (req, res) => {
  const doc = await PatientDocument.findOne({ _id: req.params.id }).lean();
  if (!doc) return res.status(404).json({ error: "Not found" });
  const d = doc as any;
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ _id: d.patient_id }).select("doctor_id patient_user_id").lean();
  if (!patient) return res.status(404).json({ error: "Not found" });
  const p = patient as { doctor_id: string; patient_user_id?: string };
  let canAccess = d.doctor_id === userId || p.patient_user_id === userId || d.uploaded_by === userId;
  if (!canAccess && p.patient_user_id) {
    const link = await PatientDoctorLink.findOne({ doctor_user_id: userId, patient_user_id: p.patient_user_id, status: "active" }).lean();
    if (link) {
      canAccess = true;
    } else {
      const fam = await FamilyConnection.findOne({ family_user_id: userId, patient_user_id: p.patient_user_id, status: "active" }).lean();
      canAccess = !!fam;
    }
  }
  if (!canAccess) return res.status(403).json({ error: "Forbidden" });
  const filePath = path.join(UPLOAD_DIR, d.file_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });
  res.sendFile(filePath, { headers: { "Content-Disposition": `inline; filename="${encodeURIComponent(d.file_name)}"` } });
});

router.delete("/patient_documents/:id", requireAuth, async (req, res) => {
  const deleted = await PatientDocument.findOneAndDelete({ _id: req.params.id, doctor_id: (req as AuthRequest).user.id });
  if (!deleted) return res.status(404).json({ error: "Not found" });
  const filePath = path.join(UPLOAD_DIR, (deleted as any).file_path);
  if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  res.status(204).send();
});

// ---------- Patients ----------
// More specific routes first so /patients/:id/medication-logs and /patients/:id are matched correctly
/** Doctor: list medication logs for a patient (adherence). Paginated for scale. */
router.get("/patients/:id/medication-logs", requireAuth, async (req, res) => {
  const patientId = req.params.id;
  const doctorId = (req as AuthRequest).user.id;
  if (!patientId) return res.status(404).json({ error: "Not found" });
  const canAccess = await doctorCanAccessPatient(doctorId, patientId);
  if (!canAccess) return res.status(404).json({ error: "Not found" });
  const q = req.query as { count?: string; limit?: string; skip?: string };
  if (q.count === "true" || q.count === "1") {
    const count = await MedicationLog.countDocuments({ patient_id: patientId });
    return res.json({ count });
  }
  const limit = Math.min(Math.max(parseInt(String(q.limit || "20"), 10) || 20, 1), 100);
  const skip = Math.max(parseInt(String(q.skip || "0"), 10) || 0, 0);
  const [list, total] = await Promise.all([
    MedicationLog.find({ patient_id: patientId })
      .sort({ logged_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MedicationLog.countDocuments({ patient_id: patientId }),
  ]);
  const items = list.map((d: any) => ({
    id: d._id?.toString(),
    logged_at: d.logged_at,
    taken: d.taken,
    time_of_day: d.time_of_day,
    medication_name: d.medication_name,
    source: d.source,
  }));
  res.json({ items, total });
});

router.get("/patients/:id", requireAuth, async (req, res) => {
  const id = req.params.id;
  const userId = (req as AuthRequest).user.id;
  if (!id) return res.status(404).json({ error: "Not found" });
  const one = await Patient.findById(id).lean();
  if (!one) return res.status(404).json({ error: "Not found" });
  const patientUserId = (one as any).patient_user_id;
  const isOwner = (one as any).doctor_id === userId;
  const hasLink = patientUserId
    ? await PatientDoctorLink.findOne({ doctor_user_id: userId, patient_user_id: patientUserId, status: "active" }).lean()
    : false;
  if (!isOwner && !hasLink) return res.status(404).json({ error: "Not found" });
  const out = { ...one, id: (one as any)._id?.toString(), _id: undefined, __v: undefined };
  res.json(out);
});

router.get("/patients", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { doctor_id?: string; patient_user_id?: string; count?: string; status?: string; clinic_id?: string; limit?: string; skip?: string };
  type PatientFilter = Record<string, string | { $in: string[] } | Array<{ doctor_id: string } | { patient_user_id: { $in: string[] } }>>;
  let filter: PatientFilter = {};
  const asClinicId = await getClinicIdForUser(userId);
  const clinicId = q.clinic_id || (asClinicId ? asClinicId : null);
  
  if (clinicId) {
    const ok = await canActForClinic(userId, clinicId);
    if (!ok) return res.status(403).json({ error: "Not allowed" });
  }

  // CRITICAL SECURITY FIX:
  // A doctor may only see a patient if they manually created the patient (doctor_id = userId)
  // or if the patient explicitly connected to them via vault code (PatientDoctorLink status = "active")
  const links = await PatientDoctorLink.find({ doctor_user_id: userId, status: "active" }).select("patient_user_id").lean();
  const linkedPatientUserIds = [...new Set((links as { patient_user_id: string }[]).map((l) => l.patient_user_id))];

  const orConditions: any[] = [{ doctor_id: userId }];
  if (linkedPatientUserIds.length > 0) {
    orConditions.push({ patient_user_id: { $in: linkedPatientUserIds } });
  }
  filter.$or = orConditions;
  if (q.patient_user_id) filter.patient_user_id = q.patient_user_id;
  if (q.status) filter.status = q.status;
  if (q.count === "true" || q.count === "1") {
    const count = await Patient.countDocuments(filter);
    return res.json({ count });
  }
  const limit = parseLimit(q.limit, LIMITS.PATIENTS_DEFAULT, LIMITS.PATIENTS_MAX);
  const skip = parseSkip(q.skip);
  const [list, total] = await Promise.all([
    Patient.find(filter).sort({ full_name: 1 }).skip(skip).limit(limit).lean(),
    Patient.countDocuments(filter),
  ]);
  const mapped = list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined }));
  res.json({ items: mapped, total });
});

router.post("/patients", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await Patient.create(body);
  res.status(201).json(doc.toJSON());
});

const MAX_BULK_PATIENTS = 500;
router.post("/patients/bulk", requireAuth, async (req, res) => {
  const body = Array.isArray(req.body) ? req.body : [];
  if (body.length > MAX_BULK_PATIENTS) {
    return res.status(400).json({ error: `Maximum ${MAX_BULK_PATIENTS} patients per bulk import. Split into smaller batches.` });
  }
  const doctorId = (req as AuthRequest).user.id;
  const docs = await Patient.insertMany(body.map((p: Record<string, unknown>) => ({ ...p, doctor_id: doctorId })));
  res.status(201).json(docs.map((d) => d.toJSON()));
});

router.patch("/patients/:id", requireAuth, async (req, res) => {
  const updated = await Patient.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Profiles ----------
router.get("/profiles", requireAuth, async (req, res) => {
  const q = req.query as { user_id?: string; doctor_code?: string };
  const filter: Record<string, string> = {};
  if (q.user_id) filter.user_id = q.user_id;
  if (q.doctor_code != null && q.doctor_code !== "") filter.doctor_code = String(q.doctor_code).toUpperCase();
  const list = await Profile.find(filter).limit(500).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.get("/profiles/me", requireAuth, async (req, res) => {
  const one = await Profile.findOne({ user_id: (req as AuthRequest).user.id }).lean();
  if (!one) return res.status(404).json({ error: "Not found" });
  res.json({ ...one, id: one._id?.toString(), _id: undefined, __v: undefined });
});

router.post("/profiles", requireAuth, async (req, res) => {
  const doc = await Profile.create(req.body);
  res.status(201).json(doc.toJSON());
});

router.patch("/profiles/:id", requireAuth, async (req, res) => {
  const updated = await Profile.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- Programs ----------
router.get("/programs", requireAuth, async (req, res) => {
  const q = req.query as { doctor_id?: string; is_active?: string };
  const filter: Record<string, unknown> = { doctor_id: (req as AuthRequest).user.id };
  if (q.is_active === "true") filter.is_active = true;
  const list = await Program.find(filter).sort({ name: 1 }).limit(200).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/programs", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  const doc = await Program.create(body);
  res.status(201).json(doc.toJSON());
});

router.patch("/programs/:id", requireAuth, async (req, res) => {
  const updated = await Program.findOneAndUpdate(
    { _id: req.params.id, doctor_id: (req as AuthRequest).user.id },
    req.body,
    { new: true }
  ).lean();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json({ ...updated, id: updated._id?.toString(), _id: undefined, __v: undefined });
});

// ---------- User roles ----------
router.get("/user_roles", requireAuth, async (req, res) => {
  const q = req.query as { user_id?: string };
  const filter = q.user_id ? { user_id: q.user_id } : {};
  const list = await UserRole.find(filter).limit(500).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/user_roles", requireAuth, async (req, res) => {
  const doc = await UserRole.create(req.body);
  res.status(201).json(doc.toJSON());
});

// ---------- Vitals ----------
router.get("/vitals", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const q = req.query as { patient_id?: string; count?: string };
  let filter: Record<string, string> = { doctor_id: userId };
  if (q.patient_id) {
    const canAccess = await doctorCanAccessPatient(userId, q.patient_id);
    if (!canAccess) return res.status(404).json({ error: "Patient not found" });
    filter = { patient_id: q.patient_id };
  }
  if (q.count === "true" || q.count === "1") {
    const count = await Vital.countDocuments(filter);
    return res.json({ count });
  }
  const list = await Vital.find(filter).sort({ recorded_at: -1 }).limit(LIMITS.VITALS_MAX).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/vitals/bulk", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { patient_id: patientId, vitals: vitalsList } = req.body as { patient_id?: string; vitals?: Array<Record<string, unknown>> };
  if (!patientId || !Array.isArray(vitalsList) || vitalsList.length === 0) {
    return res.status(400).json({ error: "patient_id and non-empty vitals array required" });
  }
  const canAccess = await doctorCanAccessPatient(userId, patientId);
  if (!canAccess) return res.status(404).json({ error: "Patient not found" });
  const valid: Array<Record<string, unknown>> = [];
  for (const v of vitalsList) {
    const vital_type = v.vital_type != null ? String(v.vital_type) : "";
    const value_text = v.value_text != null ? String(v.value_text).trim() : "";
    if (!vital_type || !value_text) continue;
    valid.push({
      patient_id: patientId,
      doctor_id: userId,
      vital_type,
      value_text,
      value_numeric: v.value_numeric != null && Number.isFinite(Number(v.value_numeric)) ? Number(v.value_numeric) : null,
      unit: v.unit != null ? String(v.unit).trim() || null : null,
      notes: v.notes != null ? String(v.notes).trim() || null : null,
      recorded_at: v.recorded_at ? new Date(v.recorded_at as string) : undefined,
    });
  }
  if (valid.length === 0) return res.status(400).json({ error: "No valid vitals (need vital_type and value_text per row)" });
  const created = await Vital.insertMany(valid);
  return res.status(201).json({ created: created.length, ids: created.map((d: any) => d._id?.toString()) });
});

router.post("/vitals", requireAuth, async (req, res) => {
  const body = { ...req.body, doctor_id: (req as AuthRequest).user.id };
  if (!body.notes || String(body.notes).trim() === "") {
    const remark = await getAiVitalRemark(body.vital_type, body.value_text, body.unit);
    if (remark) body.notes = remark;
  }
  const doc = await Vital.create(body);
  res.status(201).json(doc.toJSON());
});

// ---------- AI (Gemini) – replaces Supabase Edge Functions ----------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const LAB_EXTRACTION_PROMPT = `You are a lab report OCR and data extraction expert. Analyze the lab report (blood test, pathology, etc.) and extract EVERY test result.
Return ONLY valid JSON with no markdown or code fences: { "tested_at": "YYYY-MM-DD" or null if not visible, "results": [ { "test_name": "e.g. Haemoglobin", "result_value": "e.g. 14.2", "unit": "e.g. g/dL", "reference_range": "e.g. 12-16", "status": "normal" or "abnormal" or "critical" } ] }
- Extract all rows/tests from the report. Use exact test names and values as shown.
- Infer status from reference range when possible: within range = normal, outside = abnormal, severely out = critical.
- If reference range is missing, use "normal". Always return valid JSON only.`;

type LabExtraction = { tested_at: string | null; results: Array<{ test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }> };

function parseLabExtractionResponse(content: string): LabExtraction {
  let raw = content.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  const firstBrace = raw.indexOf("{");
  if (firstBrace >= 0) raw = raw.slice(firstBrace);
  // Fix common LLM JSON issues: trailing commas before ] or }
  let toParse = raw.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(toParse);
    return {
      tested_at: parsed.tested_at ?? null,
      results: Array.isArray(parsed.results) ? parsed.results : [],
    };
  } catch {
    // Try to extract just the results array; use bracket counting that respects strings
    const resultsMatch = raw.match(/"results"\s*:\s*\[/);
    if (resultsMatch) {
      const startIdx = raw.indexOf(resultsMatch[0]) + resultsMatch[0].length - 1; // index of [
      let depth = 0;
      let inString = false;
      let escape = false;
      let quote = "";
      let endIdx = startIdx;
      for (let i = startIdx; i < raw.length; i++) {
        const c = raw[i];
        if (inString) {
          if (escape) { escape = false; continue; }
          if (c === "\\") { escape = true; continue; }
          if (c === quote) { inString = false; continue; }
          continue;
        }
        if (c === '"' || c === "'") { inString = true; quote = c; continue; }
        if (c === "[" || c === "{") depth++;
        else if (c === "]" || c === "}") { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      const arrayStr = raw.slice(startIdx, endIdx + 1);
      try {
        const repaired = arrayStr.replace(/,(\s*[}\]])/g, "$1");
        const arr = JSON.parse(repaired);
        return { tested_at: null, results: Array.isArray(arr) ? arr : [] };
      } catch {
        // Last resort: collect individual object-like blocks
        const results: LabExtraction["results"] = [];
        const objRegex = /\{\s*"test_name"\s*:\s*"([^"]*)"\s*,\s*"result_value"\s*:\s*"([^"]*)"(?:\s*,\s*"unit"\s*:\s*"([^"]*)")?(?:\s*,\s*"reference_range"\s*:\s*"([^"]*)")?(?:\s*,\s*"status"\s*:\s*"([^"]*)")?\s*\}/g;
        let m;
        while ((m = objRegex.exec(raw)) !== null) {
          results.push({
            test_name: m[1] || "",
            result_value: m[2] || "",
            unit: m[3] || undefined,
            reference_range: m[4] || undefined,
            status: m[5] || "normal",
          });
        }
        return { tested_at: null, results };
      }
    }
  }
  return { tested_at: null, results: [] };
}

/** Upload a PDF to Gemini Files API (resumable) and return file URI. */
async function uploadPdfToGemini(apiKey: string, pdfBuffer: Buffer, displayName: string): Promise<{ fileUri: string; mimeType: string }> {
  const numBytes = pdfBuffer.length;
  const mimeType = "application/pdf";
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(numBytes),
        "X-Goog-Upload-Header-Content-Type": mimeType,
      },
      body: JSON.stringify({ file: { display_name: displayName || "lab-report.pdf" } }),
    }
  );
  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Gemini file upload start failed: ${startRes.status} ${errText}`);
  }
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No x-goog-upload-url in response");
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(numBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(pdfBuffer),
  });
  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini file upload failed: ${uploadRes.status} ${errText}`);
  }
  const fileInfo = await uploadRes.json();
  const fileUri = (fileInfo as any).file?.uri;
  if (!fileUri) throw new Error("No file.uri in upload response");
  return { fileUri, mimeType };
}

async function extractLabResultsFromPdf(
  apiKey: string | undefined,
  pdfBuffer: Buffer,
  fileName: string
): Promise<{ tested_at: string | null; results: Array<{ test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }> }> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const { fileUri, mimeType } = await uploadPdfToGemini(apiKey, pdfBuffer, fileName || "lab-report.pdf");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LAB_EXTRACTION_PROMPT }] },
        contents: [{
          role: "user",
          parts: [
            { file_data: { file_uri: fileUri, mime_type: mimeType } },
            { text: "Extract all lab test results from this PDF report. Return only the JSON." },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OCR request failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseLabExtractionResponse(content);
}

async function extractLabResultsFromImage(
  apiKey: string | undefined,
  imageBase64: string,
  mimeType: string
): Promise<{ tested_at: string | null; results: Array<{ test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }> }> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LAB_EXTRACTION_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: "Extract all lab test results from this report image. Return only the JSON." }, { inlineData: { mimeType: mimeType, data: imageBase64 } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) throw new Error("OCR request failed");
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseLabExtractionResponse(content);
}

const LAB_ANALYSIS_PROMPT = `You are a clinical assistant. Given a list of lab results, provide:
1. ai_summary: 2-4 sentences in clinical/doctor terms (findings, trends, follow-up, differential considerations).
2. layman_summary: 3-5 sentences in very simple language for the patient (what the report means in plain words, what's normal, what to discuss with the doctor). No jargon.
3. key_points: array of 3-8 short bullet strings (e.g. "HDL within range", "Elevated LDL – discuss diet").
4. charts: array of chart objects so we can show MULTIPLE graphs. Group tests by category (e.g. Lipids, Glucose, CBC, Kidney, Liver, Thyroid, Electrolytes). Each chart: { "title": "Category name (e.g. Lipid Panel)", "type": "bar", "labels": ["short test name", ...], "datasets": [{ "label": "Result", "values": [number, ...] }] }. Use numeric values only; omit non-numeric tests from charts. Use short labels (abbreviations ok). Include 1-4 charts depending on how many logical groups exist.

Return ONLY valid JSON (no markdown):
{
  "ai_summary": "string",
  "layman_summary": "string",
  "key_points": ["string", "..."],
  "charts": [{ "title": "string", "type": "bar", "labels": ["..."], "datasets": [{ "label": "string", "values": [number, ...] }] }, ...]
}
Always valid JSON only.`;

function parseLabAnalysisResponse(content: string): {
  ai_summary: string;
  layman_summary: string;
  key_points: string[];
  charts: { title: string; type: string; labels: string[]; datasets: { label: string; values: number[] }[] }[];
} {
  let raw = content.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  const firstBrace = raw.indexOf("{");
  if (firstBrace >= 0) raw = raw.slice(firstBrace);
  const toParse = raw.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(toParse);
    const charts = Array.isArray(parsed.charts)
      ? parsed.charts
          .filter((c: any) => c && c.title && Array.isArray(c.labels) && Array.isArray(c.datasets))
          .map((c: any) => ({
            title: String(c.title),
            type: c.type === "line" ? "line" : "bar",
            labels: c.labels.map((l: any) => String(l)),
            datasets: (c.datasets || []).map((d: any) => ({
              label: String(d.label || "Value"),
              values: Array.isArray(d.values) ? d.values.map((v: any) => Number(v)) : [],
            })),
          }))
      : [];
    return {
      ai_summary: parsed.ai_summary || "",
      layman_summary: parsed.layman_summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points.map((p: any) => String(p)) : [],
      charts,
    };
  } catch {
    return { ai_summary: "", layman_summary: "", key_points: [], charts: [] };
  }
}

async function analyzeLabResultsForReport(
  apiKey: string | undefined,
  results: Array<{ test_name: string; result_value: string; unit?: string; reference_range?: string; status?: string }>
): Promise<{
  ai_summary: string;
  layman_summary: string;
  key_points: string[];
  charts: { title: string; type: string; labels: string[]; datasets: { label: string; values: number[] }[] }[];
}> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const text = results.map((r) => `${r.test_name}: ${r.result_value} ${r.unit || ""} (ref: ${r.reference_range || "—"}) [${r.status || "normal"}]`).join("\n");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: LAB_ANALYSIS_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: `Lab results:\n${text}\n\nReturn the JSON only (ai_summary, layman_summary, key_points, charts).` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    }
  );
  if (!res.ok) throw new Error("Analysis request failed");
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const parsed = parseLabAnalysisResponse(content);
  return {
    ai_summary: parsed.ai_summary || "No summary generated.",
    layman_summary: parsed.layman_summary || "Review the values in the table and discuss with your doctor if anything is marked abnormal.",
    key_points: parsed.key_points,
    charts: parsed.charts,
  };
}

const DOCUMENT_ANALYSIS_PROMPT = `You are a medical document analyst. Read and understand the FULL document (report, prescription, referral, imaging report, etc.) and extract the following.

For EVERY document return:
1. summary: Brief professional summary (2-4 sentences) for the doctor.
2. layman_summary: Simple explanation in plain language for the patient (2-4 sentences).
3. key_points: List of short strings (important findings, dates, names, facility).
4. chart_data: Only if the document has numeric data to visualize (e.g. lab-like values); otherwise omit. Format: { "labels": ["label1", "..."], "datasets": [{ "label": "Series name", "values": [number, ...] }] }.

If the document is a PRESCRIPTION or contains a list of medications, ALSO extract:
5. prescription_summary: A short patient-friendly summary of the prescription, e.g. "💊 *Your Prescription Summary*\\n\\n1. *MED NAME* - dosage, frequency, duration\\n2. ..." (one line per medication).
6. medications: Array of objects, one per medication. For each medication extract everything you can read from the document. Use empty string or empty array when not specified. Structure:
   {
     "medicine": "Full medicine name (include strength/form if visible, e.g. SOTRET NF 8MG CAP 10'S (ISOTRETINOIN))",
     "dosage": "Amount per dose (e.g. 1, 2 tabs, 5ml, Local)",
     "frequency": "How often (e.g. Once a day, Twice daily, Three times a day, Once)",
     "duration": "How long (e.g. 30 Days, 2 weeks, 5 days)",
     "instructions": "Special instructions (e.g. After meals, As directed, Before food)",
     "timing_display": "Time of day if mentioned (e.g. Morning, Night, Afternoon)",
     "suggested_time": "Suggested time in HH:MM 24h if inferrable (e.g. 08:00, 20:00), else empty string",
     "food_relation": "Relation to food (e.g. after food, before food, with food, any time)",
     "timings": ["08:00", "20:00"]  // array of time strings if multiple times per day; empty array if once daily or not specified
   }

Return ONLY valid JSON (no markdown). For non-prescription documents omit prescription_summary and medications or set medications to [].
Example with prescription:
{
  "summary": "Prescription for John Doe dated ...",
  "layman_summary": "Your doctor prescribed ...",
  "key_points": ["Patient: John Doe", "Date: ...", "Medications: ..."],
  "prescription_summary": "💊 *Your Prescription Summary*\\n\\n1. *MED A* - dosage, frequency, duration\\n2. *MED B* - ...",
  "medications": [
    { "medicine": "Full name (INGREDIENT)", "dosage": "1", "frequency": "Once a day", "duration": "30 Days", "instructions": "After meals", "timing_display": "Night", "suggested_time": "20:00", "food_relation": "after food", "timings": [] }
  ]
}
Always return valid JSON only.`;

type ExtractedMedication = {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  timing_display: string;
  suggested_time: string;
  food_relation: string;
  timings: string[];
};

function parseDocumentAnalysisResponse(content: string): {
  summary: string;
  layman_summary: string;
  key_points: string[];
  chart_data?: { labels: string[]; datasets: { label: string; values: number[] }[] };
  prescription_summary?: string;
  medications?: ExtractedMedication[];
} {
  let raw = content.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  const firstBrace = raw.indexOf("{");
  if (firstBrace >= 0) raw = raw.slice(firstBrace);
  const toParse = raw.replace(/,(\s*[}\]])/g, "$1");
  try {
    const parsed = JSON.parse(toParse);
    const medications: ExtractedMedication[] = Array.isArray(parsed.medications)
      ? parsed.medications
          .filter((m: any) => m && (m.medicine || m.dosage))
          .map((m: any) => ({
            medicine: String(m.medicine ?? ""),
            dosage: String(m.dosage ?? ""),
            frequency: String(m.frequency ?? ""),
            duration: String(m.duration ?? ""),
            instructions: String(m.instructions ?? ""),
            timing_display: String(m.timing_display ?? ""),
            suggested_time: String(m.suggested_time ?? ""),
            food_relation: String(m.food_relation ?? ""),
            timings: Array.isArray(m.timings) ? m.timings.map((t: any) => String(t)) : [],
          }))
      : [];
    return {
      summary: parsed.summary || "",
      layman_summary: parsed.layman_summary || "",
      key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
      chart_data: parsed.chart_data && typeof parsed.chart_data === "object" ? parsed.chart_data : undefined,
      prescription_summary: typeof parsed.prescription_summary === "string" ? parsed.prescription_summary : undefined,
      medications: medications.length ? medications : undefined,
    };
  } catch {
    return { summary: "", layman_summary: "", key_points: [] };
  }
}

async function analyzeDocumentWithGemini(
  apiKey: string | undefined,
  opts: { type: "image"; base64: string; mimeType: string } | { type: "pdf"; buffer: Buffer; fileName: string }
): Promise<{
  summary: string;
  layman_summary: string;
  key_points: string[];
  chart_data?: { labels: string[]; datasets: { label: string; values: number[] }[] };
  prescription_summary?: string;
  medications?: ExtractedMedication[];
}> {
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const systemInstruction = { parts: [{ text: DOCUMENT_ANALYSIS_PROMPT }] };
  const generationConfig = { temperature: 0.2, maxOutputTokens: 8192 };
  let contents: { role: string; parts: unknown[] };

  if (opts.type === "pdf") {
    const { fileUri, mimeType } = await uploadPdfToGemini(apiKey, opts.buffer, opts.fileName || "document.pdf");
    contents = {
      role: "user",
      parts: [
        { file_data: { file_uri: fileUri, mime_type: mimeType } },
        { text: "Analyze this document and return the JSON only." },
      ],
    };
  } else {
    contents = {
      role: "user",
      parts: [
        { text: "Analyze this document and return the JSON only." },
        { inlineData: { mimeType: opts.mimeType, data: opts.base64 } },
      ],
    };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction, contents: [contents], generationConfig }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Document analysis failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseDocumentAnalysisResponse(text);
}

router.post("/analyze-meal-image", requireAuth, async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  const { image_base64: imageBase64, image_url: imageUrl, mime_type: mimeType } = req.body;
  let imageBase64Final = imageBase64;
  let mime = mimeType || "image/jpeg";
  if (imageUrl && !imageBase64Final) {
    try {
      const imgResp = await fetch(imageUrl as string);
      if (!imgResp.ok) throw new Error("Failed to fetch image");
      const buf = Buffer.from(await imgResp.arrayBuffer());
      imageBase64Final = buf.toString("base64");
      mime = (imgResp.headers.get("content-type") || "").split(";")[0] || "image/jpeg";
    } catch {
      return res.status(400).json({ error: "Could not fetch image from URL" });
    }
  }
  if (!imageBase64Final) return res.status(400).json({ error: "image_base64 or image_url required" });

  const systemPrompt = `You are a nutrition parser. Analyze the meal image and extract food items.
Return ONLY valid JSON: { "meal_type": "breakfast"|"lunch"|"dinner"|"snack"|"other", "food_items": [{ "name", "quantity", "unit", "calories", "protein", "carbs", "fat" }], "notes": "string" }
Infer meal_type from food type. For Indian foods use common serving sizes. Always return valid JSON only.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: "Analyze this meal image. Return only the JSON." }, { inlineData: { mimeType: mime, data: imageBase64Final } }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!geminiRes.ok) return res.status(500).json({ error: "AI analysis failed" });
  const aiResult = await geminiRes.json();
  const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
  let parsed: { meal_type?: string; food_items?: unknown[]; notes?: string };
  try {
    parsed = JSON.parse(jsonMatch[1]!.trim());
  } catch {
    return res.status(422).json({ error: "Could not parse food data", raw: content });
  }
  const items: { calories?: number; protein?: number; carbs?: number; fat?: number }[] = Array.isArray(parsed.food_items) ? (parsed.food_items as { calories?: number; protein?: number; carbs?: number; fat?: number }[]) : [];
  res.json({
    meal_type: parsed.meal_type || "other",
    food_items: items,
    notes: parsed.notes || null,
    total_calories: items.reduce((s, i) => s + (i.calories || 0), 0),
    total_protein: items.reduce((s, i) => s + (i.protein || 0), 0),
    total_carbs: items.reduce((s, i) => s + (i.carbs || 0), 0),
    total_fat: items.reduce((s, i) => s + (i.fat || 0), 0),
  });
});

/** Format medications for AI context: supports string[] or object[] (medicine, dosage, frequency_per_day, timings, etc.) */
function formatMedicationsForContext(medications: unknown): string {
  if (!medications || !Array.isArray(medications) || medications.length === 0) return "None recorded";
  return medications
    .map((m: any) => {
      if (typeof m === "string") return m;
      if (m && typeof m === "object" && m.medicine) {
        const parts = [m.medicine];
        if (m.dosage) parts.push(m.dosage);
        if (m.frequency_per_day) parts.push(`${m.frequency_per_day}x/day`);
        if (m.timings?.length) parts.push(`at ${m.timings.join(", ")}`);
        if (m.duration_days) parts.push(`for ${m.duration_days} days`);
        if (m.meal_instruction) parts.push(`(${m.meal_instruction})`);
        return parts.join(" — ");
      }
      return String(m);
    })
    .join("\n");
}

async function buildPatientContext(patientIdOrIds: string | string[], patient?: any) {
  const ids = Array.isArray(patientIdOrIds) ? patientIdOrIds : [patientIdOrIds];
  const pidFilter = ids.length === 1 ? { patient_id: ids[0] } : { patient_id: { $in: ids } };
  const [vitals, labs, appointments, enrollments, docs, healthNotes, foodLogs, medLogs, activeMeds] = await Promise.all([
    Vital.find(pidFilter).sort({ recorded_at: -1 }).limit(20).lean(),
    LabResult.find(pidFilter).sort({ tested_at: -1 }).limit(20).lean(),
    Appointment.find(pidFilter).sort({ scheduled_at: -1 }).limit(10).lean(),
    Enrollment.find(pidFilter).sort({ enrolled_at: -1 }).limit(10).lean(),
    PatientDocument.find(pidFilter).sort({ created_at: -1 }).limit(10).lean(),
    HealthNote.find(pidFilter).sort({ logged_at: -1 }).limit(10).lean(),
    FoodLog.find(pidFilter).sort({ logged_at: -1 }).limit(10).lean(),
    MedicationLog.find(pidFilter).sort({ logged_at: -1 }).limit(10).lean(),
    Medication.find({ ...pidFilter, active: true }).sort({ added_at: -1 }).lean(),
  ]);
  const parts: string[] = [];
  if (patient) {
    // Build medications from BOTH the old patient.medications array AND the new Medication collection
    let medsText = formatMedicationsForContext(patient.medications);
    if (activeMeds.length) {
      const detailedMeds = activeMeds.map((m: any) => {
        const p = [m.medicine];
        if (m.dosage) p.push(m.dosage);
        if (m.frequency) p.push(m.frequency);
        if (m.timing_display) p.push(`(${m.timing_display})`);
        if (m.food_relation) p.push(`— ${m.food_relation}`);
        if (m.instructions) p.push(`— ${m.instructions}`);
        if (m.duration) p.push(`for ${m.duration}`);
        return p.join(" ");
      });
      medsText = detailedMeds.join("\n");
    }
    parts.push(
      `PATIENT PROFILE:\n- Name: ${patient.full_name || "Unknown"}\n- Age: ${patient.age ?? "Unknown"}\n- Gender: ${patient.gender ?? "Unknown"}\n- Conditions: ${(patient.conditions?.length && patient.conditions.join(", ")) || "None"}\n- Medications:\n${medsText === "None recorded" ? "  None recorded" : medsText.split("\n").map((line) => "  " + line).join("\n")}\n- Status: ${patient.status || "active"}`
    );
  }
  if (vitals.length) parts.push("RECENT VITALS:\n" + vitals.map((v: any) => `- ${v.vital_type}: ${v.value_text}${v.unit ? ` ${v.unit}` : ""} (${new Date(v.recorded_at).toLocaleDateString()})`).join("\n"));
  if (labs.length) parts.push("LAB RESULTS:\n" + labs.map((l: any) => `- ${l.test_name}: ${l.result_value} (${new Date(l.tested_at).toLocaleDateString()})`).join("\n"));
  if (foodLogs.length) parts.push("RECENT FOOD LOGS:\n" + foodLogs.map((f: any) => `- ${f.meal_type}: ${f.notes || "no notes"} (${new Date(f.logged_at).toLocaleDateString()})`).join("\n"));
  if (medLogs.length) parts.push("RECENT MEDICATION LOGS:\n" + medLogs.map((m: any) => `- ${m.medication_name || "medication"}: ${m.taken ? "taken" : "skipped"} (${new Date(m.logged_at).toLocaleDateString()})`).join("\n"));
  if (healthNotes.length) parts.push("RECENT SYMPTOMS/NOTES:\n" + healthNotes.map((n: any) => `- ${n.note_type}: ${n.description} (${new Date(n.logged_at).toLocaleDateString()})`).join("\n"));
  if (appointments.length) parts.push("APPOINTMENTS:\n" + appointments.map((a: any) => `- ${a.title}: ${new Date(a.scheduled_at).toLocaleString()} (${a.status})`).join("\n"));
  if (enrollments.length) parts.push("PROGRAMS:\n" + enrollments.map((e: any) => `- Program ${e.program_id}: ${e.status}`).join("\n"));
  if (docs.length) parts.push("DOCUMENTS:\n" + docs.map((d: any) => `- ${d.file_name}`).join("\n"));
  return parts.join("\n\n");
}

router.post("/chat/patient", requireAuth, async (req, res) => {
  try {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  const { messages } = req.body;
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ patient_user_id: userId }).lean();
  let contextParts = "";
  if (patient) {
    const pid = (patient as any)._id.toString();
    contextParts = await buildPatientContext(pid, patient);
  }
  const todayStr = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const systemPrompt = `You are Mediimate AI — a caring health assistant for patients. You have access to the patient's health records below. You are NOT a doctor; recommend consulting their doctor for medical decisions. Be empathetic and concise.

TODAY'S DATE: ${todayStr}

=== PATIENT HEALTH RECORDS ===
${contextParts || "No patient records found."}

=== CRITICAL INSTRUCTIONS ===
1. ALWAYS prioritize and use the absolute latest/most recent records first when answering any query.
2. If the user asks about their recent health, vitals, or labs:
   - If there is recent data from the last 3 days (relative to ${todayStr}), use it directly.
   - If recent data (from the last 3 days) is NOT present or available for that vital/lab/record in the patient records, you MUST explicitly tell them: 'Latest data is not available'.
   - After stating that the latest data is not available, you must answer using the historical data (if available) but you MUST explicitly prefix or state in your response: "I'm using historical data of this date [date]" where "[date]" is the exact date of that historical record. For example: "Latest data is not available. I'm using historical data of this date May 10, 2026: your last blood sugar reading was..."
   - Never use outdated/historical records to answer questions about recent/latest health without explicitly declaring that the latest is not available and quoting the historical record's date.

Respond in a friendly, professional, and empathetic tone.`;
  const geminiContents = (messages || []).map((m: { role: string; content: string }) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || "" }] }));
  if (geminiContents.length === 0) return res.status(400).json({ error: "No messages provided" });
  const streamRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: geminiContents }) }
  );
  if (!streamRes.ok) {
    const errBody = await streamRes.json().catch(() => ({}));
    console.error("[chat/patient] Gemini error", streamRes.status, JSON.stringify(errBody));
    return res.status(500).json({ error: "AI service error", gemini_status: streamRes.status, detail: (errBody as any)?.error?.message || JSON.stringify(errBody) });
  }
  res.setHeader("Content-Type", "text/event-stream");
  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          } catch { /* skip */ }
        }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
  } catch (err: any) {
    console.error("[chat/patient] Unexpected error:", err);
    if (!res.headersSent) res.status(500).json({ error: "AI service error", detail: err?.message || "Unknown error" });
  }
});

router.post("/chat/doctor", requireAuth, async (req, res) => {
  try {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  const { messages, patient_id } = req.body;
  if (!patient_id) return res.status(400).json({ error: "patient_id required" });
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ _id: patient_id, doctor_id: userId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const pid = (patient as any)._id.toString();
  const contextParts = await buildPatientContext(pid, patient);
  const systemPrompt = `You are a clinical copilot for doctors. Patient records:\n\n${contextParts}\n\nBe precise and clinical.`;
  const geminiContents = (messages || []).map((m: { role: string; content: string }) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content || "" }] }));
  if (geminiContents.length === 0) return res.status(400).json({ error: "No messages provided" });
  const streamRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: geminiContents }) }
  );
  if (!streamRes.ok) {
    const errBody = await streamRes.json().catch(() => ({}));
    console.error("[chat/doctor] Gemini error", streamRes.status, JSON.stringify(errBody));
    return res.status(500).json({ error: "AI service error", gemini_status: streamRes.status, detail: (errBody as any)?.error?.message || JSON.stringify(errBody) });
  }
  res.setHeader("Content-Type", "text/event-stream");
  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          } catch { /* skip */ }
        }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
  } catch (err: any) {
    console.error("[chat/doctor] Unexpected error:", err);
    if (!res.headersSent) res.status(500).json({ error: "AI service error", detail: err?.message || "Unknown error" });
  }
});

// ---------- Chat: extract health data from a user message and auto-log ----------
router.post("/me/chat-extract-and-log", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const { message } = req.body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return res.json({ logged: [] });
  }
  if (!GEMINI_API_KEY) return res.json({ logged: [] });

  let extractedActions: any[] = [];
  try {
    const extractionPrompt = `Extract any health data the user is reporting in this message. Return ONLY valid JSON.

User message: "${message}"

Return this exact format:
{
  "actions": [
    { "type": "blood_pressure", "value": "120/80" },
    { "type": "blood_sugar", "value": "110" },
    { "type": "food", "meal_type": "breakfast", "notes": "description of food eaten" },
    { "type": "medication", "taken": true, "medication_name": "medicine name" },
    { "type": "symptom", "description": "headache and nausea" }
  ]
}

Rules:
- The message may be in any Indian language (Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi) or English or a mix. Extract data regardless of language.
- Only include data explicitly mentioned by the user (numbers, food items, medication names, symptoms)
- blood_pressure: must have systolic/diastolic (e.g. "120/80", "my bp is 130 over 85")
- blood_sugar: must be a number (e.g. "sugar was 110", "glucose 95")
- food: include meal_type (breakfast/lunch/dinner/snack) and notes about what they ate (translate food items to English)
- medication: set taken=true if they said they took it, false if skipped; include medication_name if mentioned
- symptom: any health complaint, pain, discomfort, or abnormality (e.g. "headache", "chest pain", "feeling dizzy"). Translate to English.
- If the message is just a question or greeting with no health data, return empty actions: { "actions": [] }
- Return ONLY the JSON, no explanation`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: extractionPrompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );
    if (geminiRes.ok) {
      const aiResult = await geminiRes.json();
      const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      try {
        const parsed = JSON.parse(jsonMatch[1]!.trim());
        extractedActions = Array.isArray(parsed.actions) ? parsed.actions : [];
      } catch { /* ignore */ }
    }
  } catch { /* best effort */ }

  if (extractedActions.length === 0) return res.json({ logged: [] });

  const filter: Record<string, unknown> = link.patient_ids.length > 1
    ? { patient_id: { $in: link.patient_ids } }
    : { patient_id: link.patient_id };
  const logged: any[] = [];

  for (const action of extractedActions) {
    try {
      if (action.type === "blood_pressure" && action.value) {
        const parts = String(action.value).split("/");
        const upper = parseFloat(parts[0]);
        await Vital.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          vital_type: "blood_pressure",
          value_text: action.value,
          value_numeric: Number.isFinite(upper) ? upper : undefined,
          unit: "mmHg",
          source: "chat",
        });
        await resolveReminderEscalation(link.patient_id, "blood_pressure");
        await updateGamificationState(link.patient_id, "blood_pressure", filter as any);
        logged.push({ type: "blood_pressure", value: action.value });
      } else if (action.type === "blood_sugar" && action.value) {
        const num = parseFloat(action.value);
        await Vital.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          vital_type: "blood_sugar",
          value_text: action.value,
          value_numeric: Number.isFinite(num) ? num : undefined,
          unit: "mg/dL",
          source: "chat",
        });
        await resolveReminderEscalation(link.patient_id, "blood_sugar");
        await updateGamificationState(link.patient_id, "blood_sugar", filter as any);
        logged.push({ type: "blood_sugar", value: action.value });
      } else if (action.type === "food") {
        await FoodLog.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          meal_type: action.meal_type || "other",
          notes: action.notes || undefined,
          source: "chat",
        });
        await updateGamificationState(link.patient_id, "food", filter as any);
        logged.push({ type: "food", meal_type: action.meal_type, notes: action.notes });
      } else if (action.type === "medication") {
        await MedicationLog.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          taken: action.taken !== false,
          medication_name: action.medication_name || undefined,
          source: "chat",
        });
        await resolveReminderEscalation(link.patient_id, "medication");
        await updateGamificationState(link.patient_id, "medication", filter as any);
        logged.push({ type: "medication", taken: action.taken, medication_name: action.medication_name });
      } else if (action.type === "symptom" && action.description) {
        await HealthNote.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          note_type: "symptom",
          description: action.description,
          source: "chat",
          severity: action.severity || undefined,
        });
        logged.push({ type: "symptom", description: action.description });
      }
    } catch (err) {
      console.error("Chat auto-log error:", err);
    }
  }

  res.json({ logged, extracted: extractedActions });
});

// ---------- Chat Conversation Persistence ----------
// Save / append messages to the current chat conversation
router.post("/me/chat-conversation/save", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const { messages, conversation_id } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages required" });
  }
  const newMsgs = messages.map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
    timestamp: new Date(),
  }));
  try {
    if (conversation_id) {
      // Append to existing conversation
      await ChatConversation.findOneAndUpdate(
        { _id: conversation_id, patient_id: link.patient_id },
        { $push: { messages: { $each: newMsgs } }, $set: { last_activity: new Date() } }
      );
      res.json({ conversation_id });
    } else {
      // Create new conversation
      const conv = await ChatConversation.create({
        patient_id: link.patient_id,
        messages: newMsgs,
        last_activity: new Date(),
        source: "chat",
      });
      res.json({ conversation_id: conv._id?.toString() });
    }
  } catch (err) {
    console.error("Chat save error:", err);
    res.status(500).json({ error: "Failed to save chat" });
  }
});

// Load the most recent chat conversation (or by ID)
router.get("/me/chat-conversation", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const convId = req.query.id as string | undefined;
  try {
    let conv;
    if (convId) {
      conv = await ChatConversation.findOne({ _id: convId, patient_id: link.patient_id }).lean();
    } else {
      // Get the most recent conversation from today (or last 24h)
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      conv = await ChatConversation.findOne({
        patient_id: link.patient_id,
        last_activity: { $gte: dayAgo },
      }).sort({ last_activity: -1 }).lean();
    }
    if (!conv) return res.json({ conversation: null });
    res.json({
      conversation: {
        id: (conv as any)._id?.toString(),
        messages: (conv as any).messages || [],
        last_activity: (conv as any).last_activity,
      },
    });
  } catch (err) {
    console.error("Chat load error:", err);
    res.status(500).json({ error: "Failed to load chat" });
  }
});

// List chat conversations (history)
router.get("/me/chat-conversations", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const list = await ChatConversation.find({ patient_id: link.patient_id })
    .sort({ last_activity: -1 })
    .limit(20)
    .select("last_activity source messages")
    .lean();
  res.json(list.map((c: any) => ({
    id: c._id?.toString(),
    last_activity: c.last_activity,
    source: c.source,
    message_count: c.messages?.length || 0,
    preview: c.messages?.length > 0 ? c.messages[0].content?.slice(0, 100) : "",
  })));
});

// ---------- Voice Doctor: AI doctor persona chat (streaming) ----------
const DOCTOR_PERSONAS: Record<string, { name: string; style: string; gender: "female" | "male" }> = {
  dr_priya: {
    name: "Dr. Priya",
    gender: "female",
    style: `You are Dr. Priya, a warm, empathetic, and caring female Indian doctor with 12 years of clinical experience in general medicine and preventive health. You speak gently, encouragingly, and with genuine concern. You use simple language the patient can understand.
You are fluent in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, and Punjabi. IMPORTANT: Always reply in the SAME language the patient is speaking. If they speak Hindi, reply in Hindi. If they mix languages, match their style naturally.`,
  },
  dr_abhay: {
    name: "Dr. Abhay",
    gender: "male",
    style: `You are Dr. Abhay, a calm, thorough, and reassuring male Indian doctor with 15 years of clinical experience in internal medicine. You are methodical, give clear confident advice, and speak with authority tempered by empathy.
You are fluent in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, and Punjabi. IMPORTANT: Always reply in the SAME language the patient is speaking. If they speak Hindi, reply in Hindi. If they mix languages, match their style naturally.`,
  },
};

const LANG_LABELS: Record<string, string> = {
  "en-IN": "English", "hi-IN": "Hindi", "ta-IN": "Tamil", "te-IN": "Telugu",
  "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi",
  "bn-IN": "Bengali", "gu-IN": "Gujarati", "pa-IN": "Punjabi",
};

// ---------- Vapi: return system prompt with full patient context ----------
router.get("/me/voice-doctor-config", requireAuth, async (req, res) => {
  const { persona, lang } = req.query as { persona?: string; lang?: string };
  const personaKey = persona && DOCTOR_PERSONAS[persona] ? persona : "dr_priya";
  const doc = DOCTOR_PERSONAS[personaKey];
  const userId = (req as AuthRequest).user.id;
  // Use same patient lookup as medication routes to ensure consistent patient_id
  const link = await getPatientForCurrentUser(req);
  const patient = link ? await Patient.findById(link.patient_id).lean() : await Patient.findOne({ patient_user_id: userId }).lean();
  const allPatientIds = link ? link.patient_ids : (patient ? [(patient as any)._id.toString()] : []);
  let contextParts = "";
  if (patient && allPatientIds.length) {
    // Build context using ALL patient IDs so we don't miss any data
    contextParts = await buildPatientContext(allPatientIds, patient);
  }
  const patientName = (patient as any)?.full_name || "the patient";
  const patientConditions = (patient as any)?.conditions || [];
  const hasBP = patientConditions.some((c: string) => /hypertension|blood.?pressure|bp|heart|cardiac/i.test(c));
  const hasDiabetes = patientConditions.some((c: string) => /diabetes|diabetic|sugar|glucose|hba1c/i.test(c));
  let todayContext = "";
  if (patient && allPatientIds.length) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayPidFilter = allPatientIds.length === 1 ? { patient_id: allPatientIds[0] } : { patient_id: { $in: allPatientIds } };
    const [todayVitals, todayFood, todayMeds] = await Promise.all([
      Vital.find({ ...todayPidFilter, recorded_at: { $gte: todayStart } }).lean(),
      FoodLog.find({ ...todayPidFilter, created_at: { $gte: todayStart } }).lean(),
      MedicationLog.find({ ...todayPidFilter, created_at: { $gte: todayStart } }).lean(),
    ]);
    const parts: string[] = [];
    if (todayVitals.length) parts.push("Already logged today: " + todayVitals.map((v: any) => `${v.vital_type}: ${v.value_text}`).join(", "));
    if (todayFood.length) parts.push("Meals logged today: " + todayFood.map((f: any) => `${(f as any).meal_type}${(f as any).notes ? ": " + (f as any).notes : ""}`).join(", "));
    if (todayMeds.length) parts.push("Medications taken today: " + todayMeds.map((m: any) => (m as any).medication_name || "medication").join(", "));
    if (parts.length === 0) parts.push("Nothing logged yet today.");
    todayContext = parts.join("\n");
  }
  const chosenLang = lang && LANG_LABELS[lang] ? LANG_LABELS[lang] : null;
  const langInstruction = chosenLang && chosenLang !== "English"
    ? `\n\n=== LANGUAGE (CRITICAL - HIGHEST PRIORITY) ===\nThe patient has selected ${chosenLang} as their language. You MUST respond ENTIRELY in ${chosenLang}. Every single word of your response must be in ${chosenLang} script and language. Do NOT mix English words unless there is no ${chosenLang} equivalent (like medical device names). Even greetings, numbers, and medical terms should be in ${chosenLang}. This is non-negotiable.`
    : "";
  const systemPrompt = `${doc.style}${langInstruction}

=== ROLE ===
You are a licensed, experienced doctor conducting a daily health check-in VOICE CALL with your patient ${patientName}. You have full medical knowledge and can discuss ANY health topic. This is a voice conversation, so keep responses conversational and concise (2-4 sentences per turn). Do NOT use markdown, bullet points, asterisks, or formatting. Speak naturally as on a phone call.

=== CONVERSATION FLOW ===
Follow this flow ONE topic at a time. Ask, listen, acknowledge, then move on:

1. GREETING: Warmly greet the patient and ask how they're feeling today. If they mention any concern, address it before moving on.

2. VITALS (OPTIONAL - don't force):
   ${hasBP ? "- Ask if they checked their blood pressure today. If yes, ask for the reading." : "- Skip BP unless the patient brings it up."}
   ${hasDiabetes ? "- Ask about blood sugar. Same approach." : "- Skip blood sugar unless the patient brings it up."}
   - For ANY vital they share, comment on whether it's in a healthy range.

3. FOOD: Ask what they've eaten so far today. If vague, probe gently. Comment on diet quality.

4. MEDICATIONS: Check the patient's medication list in PATIENT HEALTH RECORDS below. If they have prescribed medications, ask about EACH one BY NAME — for example "Did you take your Metformin today?" Do NOT say "no medications prescribed" if the list is non-empty.

5. SYMPTOMS & CONCERNS: Ask if anything is bothering them.

6. WELLNESS: Briefly ask about sleep quality and physical activity.

7. WRAP UP: Summarize what they shared. Give one actionable health tip. End warmly.

=== HANDLING MEDICAL QUESTIONS ===
Answer general health, symptom, medication, mental health, and nutrition questions like a real doctor. For emergency signs, immediately tell them to call emergency services.

=== WHAT THE PATIENT HAS LOGGED TODAY ===
${todayContext}

=== PATIENT HEALTH RECORDS ===
${contextParts || "No historical records available yet."}

=== RULES ===
- Be concise: 2-4 sentences per turn.
- NEVER say "I'm just an AI." Stay in character as ${doc.name}.
- Use the patient's name naturally.
- If the patient has already logged something today, acknowledge it and skip that topic.
${chosenLang && chosenLang !== "English" ? `- LANGUAGE: Your ENTIRE response must be in ${chosenLang}.` : "- If the patient speaks in a regional Indian language, reply in that same language."}`;

  const firstMessage = chosenLang && chosenLang !== "English"
    ? `Hello ${patientName}! I'm ${doc.name}. How are you feeling today?`
    : `Hello ${patientName}! I'm ${doc.name}, your health companion. How are you feeling today?`;

  // Collect medication names for transcriber keyword boosting
  const medKeywords: string[] = [];
  if (patient) {
    const medPidFilter = allPatientIds.length === 1 ? { patient_id: allPatientIds[0] } : { patient_id: { $in: allPatientIds } };
    const meds = await Medication.find({ ...medPidFilter, active: true }).lean();
    meds.forEach((m: any) => {
      if (m.medicine) medKeywords.push(m.medicine.split(" ")[0]); // first word (drug name)
    });
    if (Array.isArray((patient as any).medications)) {
      (patient as any).medications.forEach((m: any) => {
        const name = typeof m === "string" ? m : m?.medicine;
        if (name) medKeywords.push(name.split(" ")[0]);
      });
    }
  }

  res.json({
    systemPrompt,
    firstMessage,
    personaName: doc.name,
    personaGender: doc.gender,
    patientName,
    lang: chosenLang || "English",
    medKeywords: [...new Set(medKeywords)],
  });
});

router.post("/chat/voice-doctor", requireAuth, async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  const { messages, persona, lang } = req.body;
  const personaKey = persona && DOCTOR_PERSONAS[persona] ? persona : "dr_priya";
  const doc = DOCTOR_PERSONAS[personaKey];
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ patient_user_id: userId }).lean();
  let contextParts = "";
  if (patient) {
    const pid = (patient as any)._id.toString();
    contextParts = await buildPatientContext(pid, patient);
  }
  const patientName = (patient as any)?.full_name || "the patient";
  const patientConditions = (patient as any)?.conditions || [];
  const hasBP = patientConditions.some((c: string) => /hypertension|blood.?pressure|bp|heart|cardiac/i.test(c));
  const hasDiabetes = patientConditions.some((c: string) => /diabetes|diabetic|sugar|glucose|hba1c/i.test(c));

  // Fetch today's logs to know what's already been recorded
  let todayContext = "";
  if (patient) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const pid = (patient as any)._id.toString();
    const [todayVitals, todayFood, todayMeds] = await Promise.all([
      Vital.find({ patient_id: pid, recorded_at: { $gte: todayStart } }).lean(),
      FoodLog.find({ patient_id: pid, created_at: { $gte: todayStart } }).lean(),
      MedicationLog.find({ patient_id: pid, created_at: { $gte: todayStart } }).lean(),
    ]);
    const parts: string[] = [];
    if (todayVitals.length) parts.push("Already logged today: " + todayVitals.map((v: any) => `${v.vital_type}: ${v.value_text}`).join(", "));
    if (todayFood.length) parts.push("Meals logged today: " + todayFood.map((f: any) => `${(f as any).meal_type}${(f as any).notes ? ": " + (f as any).notes : ""}`).join(", "));
    if (todayMeds.length) parts.push("Medications taken today: " + todayMeds.map((m: any) => (m as any).medication_name || "medication").join(", "));
    if (parts.length === 0) parts.push("Nothing logged yet today.");
    todayContext = parts.join("\n");
  }

  const chosenLang = lang && LANG_LABELS[lang] ? LANG_LABELS[lang] : null;
  const langInstruction = chosenLang && chosenLang !== "English"
    ? `\n\n=== LANGUAGE (CRITICAL - HIGHEST PRIORITY) ===\nThe patient has selected ${chosenLang} as their language. You MUST respond ENTIRELY in ${chosenLang}. Every single word of your response must be in ${chosenLang} script and language. Do NOT mix English words unless there is no ${chosenLang} equivalent (like medical device names). Even greetings, numbers, and medical terms should be in ${chosenLang}. This is non-negotiable.`
    : "";

  const systemPrompt = `${doc.style}${langInstruction}

=== ROLE ===
You are a licensed, experienced doctor conducting a daily health check-in VOICE CALL with your patient ${patientName}. You have full medical knowledge and can discuss ANY health topic. This is a voice conversation, so keep responses conversational and concise (2-4 sentences per turn). Do NOT use markdown, bullet points, asterisks, or formatting. Speak naturally as on a phone call.

=== CONVERSATION FLOW ===
Follow this flow ONE topic at a time. Ask, listen, acknowledge, then move on:

1. GREETING: Warmly greet the patient and ask how they're feeling today. If they mention any concern, address it before moving on.

2. VITALS (OPTIONAL - don't force):
   ${hasBP ? "- Ask if they checked their blood pressure today. If yes, ask for the reading. If they say no or they haven't, say something like 'No worries, try to check it when you get a chance, it helps us track your health better' and move on." : "- Skip BP unless the patient brings it up."}
   ${hasDiabetes ? "- Ask about blood sugar. Same approach - if they haven't checked, gently encourage but don't insist and move on." : "- Skip blood sugar unless the patient brings it up."}
   - For ANY vital they share, comment on whether it's in a healthy range based on their profile. If concerning, explain WHY and suggest monitoring or seeing a doctor.

3. FOOD (IMPORTANT - be persistent but not annoying):
   - Ask what they've eaten so far today (breakfast, lunch, dinner depending on time of day).
   - If they're vague ("I ate normal food"), probe gently: "Can you tell me what exactly you had? It really helps me understand your nutrition."
   - If they say they skipped a meal, express mild concern and ask why.
   - Briefly comment on their diet quality. Suggest improvements naturally ("That sounds good! Maybe add some greens or a fruit next time.").
   - Explain the importance: "Logging what you eat helps me spot patterns that affect your health."

4. MEDICATIONS:
   - Ask if they took their prescribed medications today.
   - If yes, acknowledge positively.
   - If they missed a dose, ask why (forgot, side effects, ran out) and give appropriate advice.
   - If they mention side effects, take it seriously and suggest discussing with their prescribing doctor.

5. SYMPTOMS & CONCERNS:
   - Ask "Is there anything bothering you? Any pain, discomfort, or something you'd like to discuss?"
   - Give them space to talk about ANYTHING health-related.

6. WELLNESS:
   - Briefly ask about sleep quality and any physical activity.
   - Keep this light.

7. WRAP UP:
   - Summarize what they've shared ("So today your BP was 130/85, you had roti and dal for lunch, and you've been taking your medicines - that's great!").
   - Give one specific, actionable health tip relevant to THEIR profile.
   - End warmly ("Take care, and I'll check in with you again tomorrow!").

=== HANDLING MEDICAL QUESTIONS (CRITICAL) ===
Patients WILL ask questions outside the check-in flow. You MUST handle them like a real doctor:

- GENERAL HEALTH QUESTIONS (diet advice, exercise, supplements, home remedies): Answer with evidence-based information. Be helpful and specific.
- SYMPTOM QUESTIONS ("I've been having headaches", "my knee hurts"): Ask follow-up questions (duration, severity, triggers). Give possible common causes. Recommend when to see a doctor in person.
- MEDICATION QUESTIONS ("can I take paracetamol?", "what are the side effects of metformin?"): Provide accurate pharmaceutical information. Always mention checking with their prescribing doctor for changes.
- MENTAL HEALTH ("I'm feeling stressed", "I can't sleep"): Be empathetic. Offer practical coping strategies. Suggest professional help if it sounds serious.
- EMERGENCY SIGNS (chest pain, difficulty breathing, sudden weakness, severe bleeding): IMMEDIATELY tell them to call emergency services or go to the nearest hospital. Don't try to diagnose.
- NUTRITION QUESTIONS: Give specific dietary advice based on their conditions (e.g., low-sodium diet for hypertension, glycemic index for diabetes).
- LIFESTYLE QUESTIONS: Discuss exercise recommendations, stress management, sleep hygiene with practical tips.
- QUESTIONS ABOUT REPORTS/LAB RESULTS: Help interpret them in simple language, note if anything needs attention.
- COMPLETELY OFF-TOPIC (politics, entertainment, etc.): Gently steer back: "That's interesting! But let's focus on your health today. How are you feeling?"

=== PATIENT PERSONALITY HANDLING ===
- ANXIOUS PATIENT: Be extra reassuring. Don't dismiss their concerns. Validate feelings before giving information.
- NON-COMPLIANT PATIENT: Don't lecture. Use motivational interviewing. Ask "What makes it hard to take your medicine?" rather than "You need to take your medicine."
- CHATTY PATIENT: Be friendly but gently guide back to health topics after a reasonable exchange.
- QUIET/SHY PATIENT: Ask specific yes/no questions first, then open-ended ones. Don't overwhelm.
- PATIENT IN DENIAL: Use facts gently. "I understand you feel fine, but your sugar levels suggest we should be careful."
- CONFUSED PATIENT: Repeat information simply. Use analogies. Be patient.
- PATIENT WANTING DIAGNOSIS: "Based on what you're describing, it could be several things. The most common would be... But I'd really recommend getting this checked with a physical exam."

=== LOGGING IMPORTANCE ===
Weave in the importance of health logging naturally throughout the conversation:
- "The reason I ask about your meals is that food directly affects your ${hasDiabetes ? "blood sugar" : hasBP ? "blood pressure" : "overall health"}."
- "When you log regularly, we can spot trends early and prevent problems before they get serious."
- "Even on days when everything feels normal, that data point is valuable."
Don't preach. Make it conversational and genuine.

=== WHAT THE PATIENT HAS LOGGED TODAY ===
${todayContext}

=== PATIENT HEALTH RECORDS ===
${contextParts || "No historical records available yet. This might be a new patient."}

=== RULES ===
- Be concise on voice: 2-4 sentences per turn, no more unless explaining something important.
- NEVER say "I'm just an AI" or "I'm not a real doctor." Stay in character as ${doc.name} at all times.
- Use the patient's name naturally (not every turn).
- If the patient has already logged something today, acknowledge it and skip that topic.
- Numbers and medical terms: state them clearly for voice.
- If the conversation has covered all topics and the patient seems ready to go, wrap up gracefully.
${chosenLang && chosenLang !== "English" ? `- LANGUAGE REMINDER: Your ENTIRE response must be in ${chosenLang}. Not a single English word unless absolutely necessary for a medical term with no translation. This is the most important rule.` : "- If the patient speaks in a regional Indian language, reply in that same language."}

Start by greeting ${patientName} warmly IN ${chosenLang || "the patient's language"} and asking how they are feeling today.`;

  const geminiContents = (messages || []).map((m: { role: string; content: string }) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content || "" }],
  }));
  const streamRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
      }),
    }
  );
  if (!streamRes.ok) return res.status(500).json({ error: "AI service error" });
  res.setHeader("Content-Type", "text/event-stream");
  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
          } catch { /* skip */ }
        }
      }
    }
    res.write("data: [DONE]\n\n");
  } finally {
    res.end();
  }
});

// ---------- Voice Conversation: save transcript + auto-extract health data ----------
router.post("/me/voice-conversation/save", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const { messages, persona, duration_seconds, lang } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array required" });
  }
  const personaKey = persona && DOCTOR_PERSONAS[persona] ? persona : "dr_priya";

  // Save conversation
  const conv = await VoiceConversation.create({
    patient_id: link.patient_id,
    doctor_persona: personaKey,
    lang: lang || "en-IN",
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
    duration_seconds: duration_seconds || undefined,
  });

  // Extract health actions from transcript using AI
  let extractedActions: any[] = [];
  if (GEMINI_API_KEY) {
    try {
      const transcript = messages.map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? "Doctor" : "Patient"}: ${m.content}`
      ).join("\n");

      const extractionPrompt = `Extract health data from this doctor-patient conversation. Return ONLY valid JSON.

Conversation:
${transcript}

Return this exact format:
{
  "actions": [
    { "type": "blood_pressure", "value": "120/80" },
    { "type": "blood_sugar", "value": "110" },
    { "type": "food", "meal_type": "breakfast", "notes": "description of food" },
    { "type": "medication", "taken": true, "medication_name": "medicine name" },
    { "type": "symptom", "description": "symptom description" }
  ]
}

Rules:
- Only include data the PATIENT explicitly mentioned
- The conversation may be in any Indian language (Hindi, Tamil, Telugu, Kannada, Malayalam, Marathi, Bengali, Gujarati, Punjabi) or English or a mix. Extract data regardless of language.
- blood_pressure value must be in format "systolic/diastolic" (e.g. "120/80")
- blood_sugar value must be a number string (e.g. "110")
- For food, include meal_type (breakfast/lunch/dinner/snack) and notes (translate food items to English)
- For medication, include taken (true/false) and medication_name
- For symptoms, include description (translate to English)
- If the patient did not mention a type, do not include it
- Return empty actions array if no health data was mentioned
- Return ONLY the JSON, no other text`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: extractionPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
          }),
        }
      );

      if (geminiRes.ok) {
        const aiResult = await geminiRes.json();
        const content = aiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        try {
          const parsed = JSON.parse(jsonMatch[1]!.trim());
          extractedActions = Array.isArray(parsed.actions) ? parsed.actions : [];
        } catch { /* ignore parse errors */ }
      }
    } catch (e) {
      console.error("Voice extraction error:", e);
    }
  }

  // Auto-log extracted actions
  const filter: Record<string, unknown> = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const logged: any[] = [];

  for (const action of extractedActions) {
    try {
      if (action.type === "blood_pressure" && action.value) {
        const parts = String(action.value).split("/");
        const upper = parseFloat(parts[0]);
        await Vital.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          vital_type: "blood_pressure",
          value_text: action.value,
          value_numeric: Number.isFinite(upper) ? upper : undefined,
          unit: "mmHg",
          source: "voice",
        });
        await resolveReminderEscalation(link.patient_id, "blood_pressure");
        await updateGamificationState(link.patient_id, "blood_pressure", filter as any);
        logged.push({ type: "blood_pressure", value: action.value });
      } else if (action.type === "blood_sugar" && action.value) {
        const num = parseFloat(action.value);
        await Vital.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          vital_type: "blood_sugar",
          value_text: action.value,
          value_numeric: Number.isFinite(num) ? num : undefined,
          unit: "mg/dL",
          source: "voice",
        });
        await resolveReminderEscalation(link.patient_id, "blood_sugar");
        await updateGamificationState(link.patient_id, "blood_sugar", filter as any);
        logged.push({ type: "blood_sugar", value: action.value });
      } else if (action.type === "food") {
        await FoodLog.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          meal_type: action.meal_type || "other",
          notes: action.notes || undefined,
          source: "voice",
        });
        await updateGamificationState(link.patient_id, "food", filter as any);
        logged.push({ type: "food", meal_type: action.meal_type, notes: action.notes });
      } else if (action.type === "medication") {
        await MedicationLog.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          taken: action.taken === true,
          medication_name: action.medication_name || undefined,
          source: "voice",
        });
        await resolveReminderEscalation(link.patient_id, "medication");
        await updateGamificationState(link.patient_id, "medication", filter as any);
        logged.push({ type: "medication", taken: action.taken, medication_name: action.medication_name });
      } else if (action.type === "symptom" && action.description) {
        await HealthNote.create({
          patient_id: link.patient_id,
          doctor_id: link.doctor_id,
          note_type: "symptom",
          description: action.description,
          source: "voice",
          severity: action.severity || undefined,
        });
        logged.push({ type: "symptom", description: action.description });
      }
    } catch (err) {
      console.error("Auto-log error:", err);
    }
  }

  // Update conversation with extracted actions
  if (extractedActions.length > 0) {
    try {
      await VoiceConversation.updateOne(
        { _id: conv._id },
        {
          extracted_actions: extractedActions.map((a: any) => ({
            type: a.type || "",
            value: a.value || a.description || a.notes || "",
            details: a,
            logged: logged.some((l) => l.type === a.type),
            logged_at: logged.some((l) => l.type === a.type) ? new Date() : undefined,
          })),
        }
      );
    } catch (updateErr) {
      console.error("Failed to save extracted_actions:", updateErr);
    }
  }

  res.status(201).json({
    conversation_id: conv._id?.toString(),
    messages_count: messages.length,
    extracted_actions: extractedActions,
    logged,
    duration_seconds: duration_seconds || 0,
  });

  // Send consultation summary email (fire-and-forget)
  try {
    const userId = (req as AuthRequest).user.id;
    const authU = await AuthUser.findOne({ user_id: userId }).select("email").lean();
    const prof = await Profile.findOne({ user_id: userId }).select("full_name").lean();
    if (authU && (authU as any).email && messages.length > 2) {
      const docName = DOCTOR_PERSONAS[personaKey]?.name || "AI Doctor";
      const summaryParts = messages.slice(-6).map((m: { role: string; content: string }) =>
        `${m.role === "assistant" ? docName : "You"}: ${m.content}`
      );
      const loggedSummary = logged.length ? `\n\nHealth data logged: ${logged.map((l: any) => `${l.type}${l.value ? ": " + l.value : ""}`).join(", ")}` : "";
      sendConsultationSummaryEmail(
        (authU as any).email,
        (prof as any)?.full_name || "there",
        docName,
        summaryParts.join("\n") + loggedSummary,
        userId,
      ).catch(() => {});
    }
  } catch {}
});

// Get voice conversation history
router.get("/me/voice-conversations", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const filter = link.patient_ids.length > 1 ? { patient_id: { $in: link.patient_ids } } : { patient_id: link.patient_id };
  const list = await VoiceConversation.find(filter).sort({ session_date: -1 }).limit(20).lean();
  res.json(list.map((d: any) => ({ ...d, id: d._id?.toString(), _id: undefined, __v: undefined })));
});

router.post("/clinical-evidence", requireAuth, async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
  const { patient_id } = req.body;
  if (!patient_id) return res.status(400).json({ error: "patient_id required" });
  const userId = (req as AuthRequest).user.id;
  const patient = await Patient.findOne({ _id: patient_id, doctor_id: userId }).lean();
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const p = patient as any;
  const conditions = (p.conditions || []).join(", ") || "None";
  const medications = (p.medications || []).join(", ") || "None";
  const prompt = `Patient: ${p.full_name}. Conditions: ${conditions}. Medications: ${medications}. List 3-5 brief, relevant clinical considerations or evidence-based points. Use markdown.`;
  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }) }
  );
  if (!geminiRes.ok) return res.status(500).json({ error: "Evidence search failed" });
  const data = await geminiRes.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "No evidence generated.";
  res.json({ content });
});

router.post("/contact", async (req, res) => {
  const { name, email, phone, clinic_name, message, type } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Name and email are required" });

  try {
    // Store lead in MongoDB
    const lead = await ContactLead.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: phone ? String(phone).trim() : undefined,
      clinic_name: clinic_name ? String(clinic_name).trim() : undefined,
      message: message ? String(message).trim() : undefined,
      type: type || "contact",
      source: "website",
    });

    // Push to Google Sheet (non-blocking — don't fail the request if sheet sync fails)
    const sheetUrl = process.env.GSHEET_WEBHOOK_URL;
    if (sheetUrl) {
      fetch(sheetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: lead.name,
          email: lead.email,
          phone: lead.phone || "",
          clinic_name: lead.clinic_name || "",
          message: lead.message || "",
          type: lead.type,
          submitted_at: new Date().toISOString(),
        }),
      })
        .then(async (r) => {
          if (r.ok) {
            await ContactLead.updateOne({ _id: lead._id }, { $set: { gsheet_synced: true } });
          } else {
            console.error("GSheet sync failed:", r.status, await r.text().catch(() => ""));
          }
        })
        .catch((err) => console.error("GSheet sync error:", err.message));
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to submit. Please try again." });
  }
});

// ---------- Health Notes (symptoms etc.) ----------
router.post("/me/health-notes", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const { note, note_type, severity } = req.body;
  if (!note || !String(note).trim()) return res.status(400).json({ error: "note text required" });
  const doc = await HealthNote.create({
    patient_id: link.patient_id,
    note: String(note).trim(),
    note_type: note_type || "symptom",
    severity: severity || "low",
    source: "manual",
  });
  res.status(201).json({ id: doc._id?.toString(), ...doc.toJSON() });
});

router.get("/me/health-notes", requireAuth, async (req, res) => {
  const link = await getPatientForCurrentUser(req);
  if (!link) return res.status(404).json({ error: "Patient record not linked" });
  const limit = parseLimit(req.query.limit as string | undefined, LIMITS.DEFAULT_PAGE_SIZE, LIMITS.MAX_PAGE_SIZE);
  const skip = parseSkip(req.query.skip as string | undefined);
  const filter = link.patient_ids.length > 1
    ? { patient_id: { $in: link.patient_ids } }
    : { patient_id: link.patient_id };
  const list = await HealthNote.find(filter).sort({ logged_at: -1 }).skip(skip).limit(limit).lean();
  res.json(list);
});

// ═══════════════════════════════════════════════════════════════
// Case Management — Patient endpoints
// ═══════════════════════════════════════════════════════════════

router.post("/me/cases", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const {
    condition, condition_details, budget_min, budget_max,
    preferred_location, preferred_country,
    medical_documents, document_ids, vault_code,
    consent_terms_accepted, patient_phone, intent_data,
  } = req.body;
  if (!condition) return res.status(400).json({ error: "condition is required" });
  if (!consent_terms_accepted) return res.status(400).json({ error: "You must accept the terms to proceed" });
  try {
    const c = await Case.create({
      patient_user_id: userId,
      condition,
      condition_details,
      budget_min,
      budget_max,
      preferred_location,
      preferred_country,
      medical_documents: medical_documents || [],
      document_ids: document_ids || [],
      vault_code: vault_code || undefined,
      consent_terms_accepted: true,
      consent_accepted_at: new Date(),
      patient_phone: patient_phone || undefined,
      status: "submitted",
      intent_data: intent_data || undefined,
      status_history: [
        { status: "submitted", message: "Your treatment request has been received. Our team will review it and find the best hospitals for you.", timestamp: new Date() },
      ],
    });
    res.status(201).json(c);
  } catch {
    res.status(500).json({ error: "Failed to create case" });
  }
});

router.post("/me/cases/:id/documents", requireAuth, upload.single("file"), async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    const c = await Case.findOne({ _id: req.params.id, patient_user_id: userId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.filename;
    const docIds = (c as any).document_ids || [];
    docIds.push(filePath);
    (c as any).document_ids = docIds;

    const medDocs = (c as any).medical_documents || [];
    medDocs.push(req.file.originalname);
    (c as any).medical_documents = medDocs;

    await c.save();
    res.json({ success: true, file: filePath, name: req.file.originalname });
  } catch {
    res.status(500).json({ error: "Failed to upload document" });
  }
});

router.get("/me/cases", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    const cases = await Case.find({ patient_user_id: userId }).sort({ createdAt: -1 }).lean();
    const clinicIds = [...new Set(cases.map((c: any) => c.matched_clinic_id).filter(Boolean))];
    const clinics = clinicIds.length ? await Clinic.find({ _id: { $in: clinicIds } }).lean() : [];
    const clinicMap = new Map(clinics.map((c: any) => [c._id.toString(), c]));
    const result = cases.map((c: any) => ({
      ...c,
      id: c._id?.toString(),
      _id: undefined,
      __v: undefined,
      matched_clinic_name: c.matched_clinic_id ? (clinicMap.get(c.matched_clinic_id) as any)?.name || null : null,
      approved_hospital_count: (c.approved_hospitals || []).length,
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to fetch cases" });
  }
});

router.get("/me/cases/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    const c = await Case.findOne({ _id: req.params.id, patient_user_id: userId }).lean();
    if (!c) return res.status(404).json({ error: "Case not found" });
    let clinic = null;
    if ((c as any).matched_clinic_id) {
      clinic = await Clinic.findById((c as any).matched_clinic_id).lean();
    }
    let doctor = null;
    if ((c as any).matched_doctor_id) {
      doctor = await Profile.findOne({ user_id: (c as any).matched_doctor_id }).lean();
    }
    let coordinator = null;
    if ((c as any).coordinator_id) {
      const coordProfile = await Profile.findOne({ user_id: (c as any).coordinator_id }).lean();
      if (coordProfile) coordinator = { id: (c as any).coordinator_id, name: (coordProfile as any).full_name, phone: (coordProfile as any).phone };
    }

    res.json({
      ...(c as any),
      id: (c as any)._id?.toString(),
      _id: undefined,
      __v: undefined,
      matched_clinic: clinic ? { id: (clinic as any)._id?.toString(), name: (clinic as any).name, city: (clinic as any).city, specialties: (clinic as any).specialties } : null,
      matched_doctor: doctor ? { name: (doctor as any).full_name, specialties: (doctor as any).specialties } : null,
      coordinator,
      status_history: (c as any).status_history || [],
      approved_hospitals: (c as any).approved_hospitals || [],
    });
  } catch {
    res.status(500).json({ error: "Failed to fetch case" });
  }
});

router.patch("/me/cases/:id/cancel", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  try {
    const c = await Case.findOne({ _id: req.params.id, patient_user_id: userId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if (["treatment_in_progress", "treatment_completed"].includes((c as any).status)) {
      return res.status(400).json({ error: "Cannot cancel a case that is in progress or completed" });
    }
    (c as any).status = "cancelled";
    await c.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to cancel case" });
  }
});

router.patch("/me/cases/:id/select-hospital", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { clinic_id } = req.body;
  if (!clinic_id) return res.status(400).json({ error: "clinic_id is required" });
  try {
    const c = await Case.findOne({ _id: req.params.id, patient_user_id: userId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if ((c as any).status !== "hospital_matched") {
      return res.status(400).json({ error: "Hospital can only be selected when options are available" });
    }
    const approved = ((c as any).approved_hospitals || []).find(
      (h: any) => h.clinic_id === clinic_id
    );
    if (!approved) return res.status(400).json({ error: "This hospital is not in your approved options" });

    (c as any).matched_clinic_id = clinic_id;
    (c as any).matched_at = new Date();
    (c as any).status = "hospital_accepted";
    (c as any).status_history = [
      ...((c as any).status_history || []),
      {
        status: "hospital_accepted",
        message: `You selected ${approved.clinic_name}. Our Mediimate coordinator will contact you shortly to guide you through the next steps.`,
        timestamp: new Date(),
      },
    ];
    await c.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to select hospital" });
  }
});

router.post("/me/hospital-reviews", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const { clinic_id, case_id, rating, review_text } = req.body;
  if (!clinic_id || !rating) return res.status(400).json({ error: "clinic_id and rating are required" });
  if (case_id) {
    const c = await Case.findOne({ _id: case_id, patient_user_id: userId, status: "treatment_completed" }).lean();
    if (!c) return res.status(400).json({ error: "Can only review after treatment is completed" });
  }
  try {
    const review = await HospitalReview.create({
      clinic_id,
      patient_user_id: userId,
      case_id,
      rating: Math.min(5, Math.max(1, Number(rating))),
      review_text,
      is_verified: !!case_id,
    });
    const agg = await HospitalReview.aggregate([
      { $match: { clinic_id } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    if (agg.length) {
      await Clinic.updateOne({ _id: clinic_id }, { $set: { rating_avg: Math.round(agg[0].avg * 10) / 10, total_reviews: agg[0].count } });
    }
    res.status(201).json(review);
  } catch {
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// ═══════════════════════════════════════════════════════════════
// Case Management — Clinic/Hospital endpoints
// ═══════════════════════════════════════════════════════════════

router.get("/clinic/cases", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const cases = await Case.find({ matched_clinic_id: clinicId }).sort({ createdAt: -1 }).lean();
    const patientIds = [...new Set(cases.map((c: any) => c.patient_user_id))];
    const profiles = patientIds.length ? await Profile.find({ user_id: { $in: patientIds } }).lean() : [];
    const profileMap = new Map(profiles.map((p: any) => [p.user_id, p]));
    const result = cases.map((c: any) => ({
      ...c,
      id: c._id?.toString(),
      _id: undefined,
      __v: undefined,
      patient_name: (profileMap.get(c.patient_user_id) as any)?.full_name || "Unknown",
    }));
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to fetch clinic cases" });
  }
});

router.patch("/clinic/cases/:id/accept", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    if ((c as any).status !== "hospital_matched") return res.status(400).json({ error: "Case is not in hospital_matched status" });
    (c as any).status = "hospital_accepted";
    (c as any).accepted_at = new Date();
    await c.save();
    await Notification.create({
      user_id: (c as any).patient_user_id,
      title: "Hospital Accepted Your Case",
      message: "A hospital has accepted your treatment request. View details in your cases.",
      type: "success",
      category: "case",
      related_id: c._id?.toString(),
      related_type: "case",
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to accept case" });
  }
});

router.patch("/clinic/cases/:id/reject", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    (c as any).status = "submitted";
    (c as any).rejection_reason = req.body.reason || "";
    (c as any).matched_clinic_id = undefined;
    (c as any).matched_doctor_id = undefined;
    (c as any).matched_at = undefined;
    await c.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to reject case" });
  }
});

router.patch("/clinic/cases/:id/treatment-plan", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    const { description, estimated_cost, estimated_duration, file_path } = req.body;
    (c as any).treatment_plan = {
      description,
      estimated_cost,
      estimated_duration,
      uploaded_by: userId,
      uploaded_at: new Date(),
      file_path,
    };
    await c.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update treatment plan" });
  }
});

router.patch("/clinic/cases/:id/schedule", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    const { treatment_start_date, treatment_end_date } = req.body;
    (c as any).status = "treatment_scheduled";
    (c as any).treatment_start_date = new Date(treatment_start_date);
    if (treatment_end_date) (c as any).treatment_end_date = new Date(treatment_end_date);
    await c.save();
    await Notification.create({
      user_id: (c as any).patient_user_id,
      title: "Treatment Scheduled",
      message: `Your treatment has been scheduled starting ${new Date(treatment_start_date).toLocaleDateString()}.`,
      type: "info",
      category: "case",
      related_id: c._id?.toString(),
      related_type: "case",
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to schedule treatment" });
  }
});

router.patch("/clinic/cases/:id/start", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    (c as any).status = "treatment_in_progress";
    if (!(c as any).treatment_start_date) (c as any).treatment_start_date = new Date();
    await c.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to start treatment" });
  }
});

router.patch("/clinic/cases/:id/complete", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).user.id;
  const clinicId = await getClinicIdForUser(userId);
  if (!clinicId) return res.status(403).json({ error: "Not a clinic user" });
  try {
    const c = await Case.findOne({ _id: req.params.id, matched_clinic_id: clinicId });
    if (!c) return res.status(404).json({ error: "Case not found" });
    (c as any).status = "treatment_completed";
    (c as any).treatment_end_date = new Date();
    await c.save();
    const { program_id, doctor_id } = req.body;
    if (program_id) {
      const enrollment = await Enrollment.create({
        patient_id: (c as any).patient_user_id,
        program_id,
        doctor_id: doctor_id || (c as any).matched_doctor_id || userId,
        clinic_id: clinicId,
        status: "active",
      });
      (c as any).enrollment_id = enrollment._id.toString();
      await c.save();
    }
    await Notification.create({
      user_id: (c as any).patient_user_id,
      title: "Treatment Completed",
      message: "Your treatment has been marked as completed. Thank you for choosing Mediimate!",
      type: "success",
      category: "case",
      related_id: c._id?.toString(),
      related_type: "case",
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to complete case" });
  }
});

export default router;
