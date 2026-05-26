/**
 * Auth routes mounted first under /api so register and login are always available.
 */
import { Router } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthUser, Clinic, ClinicMember, FamilyConnection, Patient, Profile, UserRole, EmailVerification } from "../models/index.js";
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail } from "../services/email.js";
import { whatsapp } from "../services/whatsapp.js";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

/** Seed admin account on import (runs once at server boot) */
(async function seedAdmin() {
  try {
    const adminEmail = "admin@mediimate.com";
    let existing = await AuthUser.findOne({ email: adminEmail }).lean();
    let adminUserId: string;

    if (!existing) {
      adminUserId = crypto.randomUUID();
      const password_hash = await bcrypt.hash("Test1234!", 10);
      await AuthUser.create({
        email: adminEmail,
        password_hash,
        user_id: adminUserId,
        email_verified: true,
        approval_status: "active",
      });
      await Profile.create({ user_id: adminUserId, full_name: "Mediimate Admin" });
      console.log("Admin account created: admin@mediimate.com");
    } else {
      adminUserId = (existing as any).user_id;
      // Ensure email is verified and account is active
      await AuthUser.updateOne(
        { email: adminEmail },
        { $set: { email_verified: true, approval_status: "active" } }
      );
    }

    // Always ensure admin role exists (fixes cases where user was registered
    // through normal flow without admin role, or seed ran partially)
    const existingRole = await UserRole.findOne({ user_id: adminUserId }).lean();
    if (!existingRole) {
      await UserRole.create({ user_id: adminUserId, role: "admin" });
      console.log("Admin role created for:", adminEmail);
    } else if ((existingRole as any).role !== "admin") {
      await UserRole.updateOne({ user_id: adminUserId }, { $set: { role: "admin" } });
      console.log("Admin role fixed for:", adminEmail, "(was:", (existingRole as any).role, ")");
    }
  } catch (err) {
    console.error("Admin seed error (non-fatal):", err);
  }
})();

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** GET /api/health - verify this app and /api auth routes are deployed (no auth required) */
router.get("/health", (_req, res) => {
  res.json({ ok: true, auth: true, message: "Plan Partner API with auth routes" });
});

router.post("/auth/register", async (req, res) => {
  const { email, password, full_name, role, clinic_name, address, phone } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  const phoneTrimmed = phone != null ? String(phone).trim() : "";
  if (!phoneTrimmed) {
    return res.status(400).json({ error: "Phone number is required" });
  }
  const roleChoice = role === "patient" ? "patient" : role === "clinic" ? "clinic" : role === "family" ? "family" : "doctor";
  if (roleChoice !== "clinic" && (!full_name || !String(full_name).trim())) {
    return res.status(400).json({ error: "Full name is required" });
  }
  if (roleChoice === "clinic") {
    if (!clinic_name || !String(clinic_name).trim()) return res.status(400).json({ error: "Clinic name is required" });
    if (!address || !String(address).trim()) return res.status(400).json({ error: "Clinic address is required" });
  }
  const existing = await AuthUser.findOne({ email: (email as string).toLowerCase() }).lean();
  if (existing) return res.status(400).json({ error: "Email already registered" });

  const user_id = crypto.randomUUID();
  const password_hash = await bcrypt.hash(password, 10);
  const emailNorm = (email as string).toLowerCase();

  const needsApproval = roleChoice === "doctor" || roleChoice === "clinic";
  const approvalStatus = needsApproval ? "pending_approval" : "active";

  if (roleChoice === "family") {
    await AuthUser.create({ email: emailNorm, password_hash, user_id, email_verified: false, approval_status: "active" });
    await Profile.create({ user_id, full_name: full_name || "", phone: phoneTrimmed });
    await UserRole.create({ user_id, role: "family" });
    await FamilyConnection.updateMany(
      {
        $or: [
          { invite_email: emailNorm.trim(), status: "pending" },
          { invite_phone: phoneTrimmed, status: "pending" }
        ]
      },
      { $set: { family_user_id: user_id, status: "active" } }
    );
  } else if (roleChoice === "clinic") {
    const clinicDoc = await Clinic.create({
      name: String(clinic_name).trim(),
      address: String(address).trim(),
      phone: phoneTrimmed,
      created_by: user_id,
    });
    const clinicId = clinicDoc._id.toString();
    await AuthUser.create({ email: emailNorm, password_hash, user_id, clinic_id: clinicId, email_verified: false, approval_status: "pending_approval" });
    await Profile.create({ user_id, full_name: full_name?.trim() || String(clinic_name).trim() });
    await UserRole.create({ user_id, role: "clinic", clinic_id: clinicId });
    await ClinicMember.create({ clinic_id: clinicId, user_id, role: "owner" });
  } else {
    await AuthUser.create({ email: emailNorm, password_hash, user_id, email_verified: false, approval_status: approvalStatus });
    await Profile.create({ user_id, full_name: full_name || "", phone: phoneTrimmed });
    await UserRole.create({ user_id, role: roleChoice });

    if (roleChoice === "patient") {
      const existingPatient = await Patient.findOne({ patient_user_id: user_id }).lean();
      if (!existingPatient) {
        await Patient.create({
          patient_user_id: user_id,
          doctor_id: user_id,
          full_name: full_name || "Patient",
          phone: phoneTrimmed,
          status: "active",
        });
      }
    }
  }

  // Generate and send verification code
  const code = generateOTP();
  await EmailVerification.create({
    email: emailNorm,
    user_id,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    purpose: "signup",
  });
  const displayName = roleChoice === "clinic" ? String(clinic_name).trim() : (full_name || "").trim();
  sendVerificationEmail(emailNorm, code, displayName).catch(() => {});

  const token = jwt.sign({ sub: user_id }, JWT_SECRET, { expiresIn: "30d" });
  return res.status(201).json({
    token,
    user: { id: user_id, email: emailNorm },
    email_verified: false,
    approval_status: approvalStatus,
    message: needsApproval
      ? "Account created. Your account is pending admin approval."
      : "Account created. Please verify your email with the code we sent.",
  });
});

/** Verify email with OTP code */
router.post("/auth/verify-email", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code required" });

  const emailNorm = String(email).trim().toLowerCase();
  const record = await EmailVerification.findOne({
    email: emailNorm,
    code: String(code).trim(),
    used: false,
    expires_at: { $gt: new Date() },
  });

  if (!record) {
    return res.status(400).json({ error: "Invalid or expired code. Please request a new one." });
  }

  // Mark code as used and user as verified
  await record.updateOne({ used: true });
  await AuthUser.updateOne({ email: emailNorm }, { $set: { email_verified: true } });

  // Send welcome email
  const profile = await Profile.findOne({ user_id: (record as any).user_id }).lean();
  const roleDoc = await UserRole.findOne({ user_id: (record as any).user_id }).lean();
  const name = (profile as any)?.full_name || "there";
  const userRole = (roleDoc as any)?.role || "patient";
  sendWelcomeEmail(emailNorm, name, userRole, (record as any).user_id).catch(() => {});

  return res.json({ verified: true, message: "Email verified successfully!" });
});

/** Resend verification code */
router.post("/auth/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const emailNorm = String(email).trim().toLowerCase();
  const authUser = await AuthUser.findOne({ email: emailNorm }).lean();
  if (!authUser) return res.status(404).json({ error: "Account not found" });
  if ((authUser as any).email_verified) return res.json({ message: "Email already verified" });

  // Rate limit: max 1 code per minute
  const recent = await EmailVerification.findOne({
    email: emailNorm,
    created_at: { $gt: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) return res.status(429).json({ error: "Please wait 60 seconds before requesting a new code" });

  const code = generateOTP();
  await EmailVerification.create({
    email: emailNorm,
    user_id: (authUser as any).user_id,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "signup",
  });

  const profile = await Profile.findOne({ user_id: (authUser as any).user_id }).lean();
  sendVerificationEmail(emailNorm, code, (profile as any)?.full_name).catch(() => {});

  return res.json({ message: "Verification code sent" });
});

/** Forgot password — send reset code */
router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const emailNorm = String(email).trim().toLowerCase();
  const authUser = await AuthUser.findOne({ email: emailNorm }).lean();
  if (!authUser) {
    // Don't reveal if email exists
    return res.json({ message: "If that email is registered, a reset code has been sent." });
  }

  // Rate limit
  const recent = await EmailVerification.findOne({
    email: emailNorm,
    purpose: "password_reset",
    created_at: { $gt: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) return res.status(429).json({ error: "Please wait 60 seconds before requesting a new code" });

  const code = generateOTP();
  await EmailVerification.create({
    email: emailNorm,
    user_id: (authUser as any).user_id,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "password_reset",
  });

  const profile = await Profile.findOne({ user_id: (authUser as any).user_id }).lean();
  sendPasswordResetEmail(emailNorm, code, (profile as any)?.full_name).catch(() => {});

  return res.json({ message: "If that email is registered, a reset code has been sent." });
});

/** Reset password with code */
router.post("/auth/reset-password", async (req, res) => {
  const { email, code, new_password } = req.body;
  if (!email || !code || !new_password) return res.status(400).json({ error: "Email, code, and new password required" });
  if (String(new_password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  const emailNorm = String(email).trim().toLowerCase();
  const record = await EmailVerification.findOne({
    email: emailNorm,
    code: String(code).trim(),
    purpose: "password_reset",
    used: false,
    expires_at: { $gt: new Date() },
  });
  if (!record) return res.status(400).json({ error: "Invalid or expired code" });

  const password_hash = await bcrypt.hash(new_password, 10);
  await AuthUser.updateOne({ email: emailNorm }, { $set: { password_hash } });
  await record.updateOne({ used: true });

  return res.json({ message: "Password reset successfully. You can now sign in." });
});

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const emailNorm = String(email).trim().toLowerCase();
  const authUser = await AuthUser.findOne({ email: emailNorm }).lean();
  if (!authUser) return res.status(401).json({ error: "Invalid email or password" });

  const ok = await bcrypt.compare(password, (authUser as any).password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });

  const approvalStatus = (authUser as any).approval_status || "active";
  if (approvalStatus === "rejected") return res.status(403).json({ error: "Your account has been rejected.", approval_status: "rejected" });
  if (approvalStatus === "suspended") return res.status(403).json({ error: "Your account has been suspended.", approval_status: "suspended" });

  const token = jwt.sign({ sub: (authUser as any).user_id }, JWT_SECRET, { expiresIn: "30d" });
  return res.json({
    token,
    user: { id: (authUser as any).user_id, email: (authUser as any).email },
    email_verified: !!(authUser as any).email_verified,
    approval_status: approvalStatus,
  });
});

/** Request OTP for login (passwordless) */
router.post("/auth/login-otp-request", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const emailNorm = String(email).trim().toLowerCase();
  const authUser = await AuthUser.findOne({ email: emailNorm }).lean();
  if (!authUser) return res.status(404).json({ error: "No account found with this email. Please sign up first." });

  // Rate limit: max 1 code per minute
  const recent = await EmailVerification.findOne({
    email: emailNorm,
    purpose: "login_otp",
    created_at: { $gt: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) return res.status(429).json({ error: "Please wait 60 seconds before requesting a new code" });

  const code = generateOTP();
  await EmailVerification.create({
    email: emailNorm,
    user_id: (authUser as any).user_id,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "login_otp",
  });

  const profile = await Profile.findOne({ user_id: (authUser as any).user_id }).lean();
  const { sendLoginOTPEmail } = await import("../services/email.js");
  sendLoginOTPEmail(emailNorm, code, (profile as any)?.full_name).catch(() => {});

  return res.json({ message: "Login code sent to your email", email: emailNorm });
});

/** Verify OTP and login (passwordless) */
router.post("/auth/login-otp-verify", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: "Email and code required" });

  const emailNorm = String(email).trim().toLowerCase();
  const record = await EmailVerification.findOne({
    email: emailNorm,
    code: String(code).trim(),
    purpose: "login_otp",
    used: false,
    expires_at: { $gt: new Date() },
  });

  if (!record) return res.status(400).json({ error: "Invalid or expired code. Please request a new one." });

  await record.updateOne({ used: true });

  const authUser = await AuthUser.findOne({ email: emailNorm }).lean();
  if (!authUser) return res.status(404).json({ error: "Account not found" });

  // Auto-verify email if not verified
  if (!(authUser as any).email_verified) {
    await AuthUser.updateOne({ email: emailNorm }, { $set: { email_verified: true } });
  }

  const otpApprovalStatus = (authUser as any).approval_status || "active";
  if (otpApprovalStatus === "rejected") return res.status(403).json({ error: "Your account has been rejected.", approval_status: "rejected" });
  if (otpApprovalStatus === "suspended") return res.status(403).json({ error: "Your account has been suspended.", approval_status: "suspended" });

  const token = jwt.sign({ sub: (authUser as any).user_id }, JWT_SECRET, { expiresIn: "30d" });
  return res.json({
    token,
    user: { id: (authUser as any).user_id, email: (authUser as any).email },
    email_verified: true,
    approval_status: otpApprovalStatus,
  });
});

/** Request WhatsApp OTP for login */
router.post("/auth/whatsapp-otp-request", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const phoneNorm = String(phone).replace(/[\s\-\(\)\.]/g, "");
  const profile = await Profile.findOne({ phone: { $regex: phoneNorm.replace(/^\+/, "\\+?") } }).lean();
  if (!profile) return res.status(404).json({ error: "No account found with this phone. Please sign up first." });

  const authUser = await AuthUser.findOne({ user_id: (profile as any).user_id }).lean();
  if (!authUser) return res.status(404).json({ error: "Account not found" });

  const recent = await EmailVerification.findOne({
    user_id: (authUser as any).user_id,
    purpose: "whatsapp_otp",
    created_at: { $gt: new Date(Date.now() - 60 * 1000) },
  });
  if (recent) return res.status(429).json({ error: "Please wait 60 seconds before requesting a new code" });

  const code = generateOTP();
  await EmailVerification.create({
    email: (authUser as any).email,
    user_id: (authUser as any).user_id,
    code,
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    purpose: "whatsapp_otp",
  });

  whatsapp.sendOTP(phoneNorm, code).catch(() => {});

  return res.json({ message: "OTP sent via WhatsApp", phone: phoneNorm });
});

/** Verify WhatsApp OTP and login */
router.post("/auth/whatsapp-otp-verify", async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: "Phone and code required" });

  const phoneNorm = String(phone).replace(/[\s\-\(\)\.]/g, "");
  const profile = await Profile.findOne({ phone: { $regex: phoneNorm.replace(/^\+/, "\\+?") } }).lean();
  if (!profile) return res.status(404).json({ error: "Account not found" });

  const record = await EmailVerification.findOne({
    user_id: (profile as any).user_id,
    code: String(code).trim(),
    purpose: "whatsapp_otp",
    used: false,
    expires_at: { $gt: new Date() },
  });
  if (!record) return res.status(400).json({ error: "Invalid or expired code" });

  await record.updateOne({ used: true });

  const authUser = await AuthUser.findOne({ user_id: (profile as any).user_id }).lean();
  if (!authUser) return res.status(404).json({ error: "Account not found" });

  if (!(authUser as any).email_verified) {
    await AuthUser.updateOne({ user_id: (profile as any).user_id }, { $set: { email_verified: true } });
  }

  const approvalStatus = (authUser as any).approval_status || "active";
  if (approvalStatus === "rejected") return res.status(403).json({ error: "Account rejected", approval_status: "rejected" });
  if (approvalStatus === "suspended") return res.status(403).json({ error: "Account suspended", approval_status: "suspended" });

  const token = jwt.sign({ sub: (authUser as any).user_id }, JWT_SECRET, { expiresIn: "30d" });
  return res.json({
    token,
    user: { id: (authUser as any).user_id, email: (authUser as any).email },
    email_verified: true,
    approval_status: approvalStatus,
  });
});

export default router;
