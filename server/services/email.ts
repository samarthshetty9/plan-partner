/**
 * Email service — AWS SES via Nodemailer
 * Handles all transactional emails: verification, notifications, alerts.
 */
import nodemailer from "nodemailer";
import { EmailNotificationLog } from "../models/index.js";

const {
  SES_SMTP_HOST = "",
  SES_SMTP_PORT = "587",
  SES_SMTP_USER = "",
  SES_SMTP_PASS = "",
  SES_FROM_EMAIL = "noreply@mediimate.com",
  SES_FROM_NAME = "Mediimate",
} = process.env;

const isConfigured = !!(SES_SMTP_HOST && SES_SMTP_USER && SES_SMTP_PASS);

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: SES_SMTP_HOST,
      port: parseInt(SES_SMTP_PORT, 10),
      secure: false,
      auth: { user: SES_SMTP_USER, pass: SES_SMTP_PASS },
    })
  : null;

const FROM = `${SES_FROM_NAME} <${SES_FROM_EMAIL}>`;

// ─── Base HTML wrapper ──────────────────────────────────────────
function wrapHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <tr><td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:28px 32px;text-align:center;">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Mediimate</h1>
    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Your Health Companion</p>
  </td></tr>
  <tr><td style="padding:32px;">${bodyContent}</td></tr>
  <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} Mediimate. All rights reserved.</p>
    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">This is an automated email. Please do not reply.</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// ─── Send email helper ──────────────────────────────────────────
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  template: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  if (!isConfigured) {
    console.log(`[email] SES not configured — skipping email to ${opts.to}: ${opts.subject}`);
    return false;
  }
  try {
    await transporter!.sendMail({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    await EmailNotificationLog.create({
      to_email: opts.to,
      to_user_id: opts.userId,
      subject: opts.subject,
      template: opts.template,
      status: "sent",
      metadata: opts.metadata,
    });
    console.log(`[email] Sent "${opts.template}" to ${opts.to}`);
    return true;
  } catch (err: any) {
    console.error(`[email] Failed "${opts.template}" to ${opts.to}:`, err.message);
    await EmailNotificationLog.create({
      to_email: opts.to,
      to_user_id: opts.userId,
      subject: opts.subject,
      template: opts.template,
      status: "failed",
      error: err.message,
    }).catch(() => {});
    return false;
  }
}

// ─── Template: Email Verification Code ──────────────────────────
export async function sendVerificationEmail(to: string, code: string, name?: string) {
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const html = wrapHtml("Verify Your Email", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Welcome to Mediimate! Please verify your email address using the code below:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:16px 40px;">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#16a34a;">${code}</span>
      </div>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This code expires in <strong>10 minutes</strong>.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">If you didn't create an account on Mediimate, you can safely ignore this email.</p>
  `);
  return sendEmail({ to, subject: `${code} — Verify your Mediimate account`, html, template: "verification" });
}

// ─── Template: Welcome Email ────────────────────────────────────
export async function sendWelcomeEmail(to: string, name: string, role: string, userId?: string) {
  const roleLabel = role === "doctor" ? "Doctor" : role === "clinic" ? "Clinic Admin" : role === "family" ? "Family Member" : "Patient";
  const html = wrapHtml("Welcome to Mediimate", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your ${roleLabel} account on Mediimate is now verified and ready to use!</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">Here's what you can do:</p>
      ${role === "doctor" || role === "clinic" ? `
        <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#374151;">
          <li>Add and manage patients</li>
          <li>Track vitals, medications & appointments</li>
          <li>Get AI-powered health insights</li>
          <li>Receive alerts for at-risk patients</li>
        </ul>
      ` : `
        <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#374151;">
          <li>Chat with your AI health assistant</li>
          <li>Log vitals, meals & medications</li>
          <li>Talk to AI Doctor (voice consultations)</li>
          <li>Share health data with your doctor & family</li>
        </ul>
      `}
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/auth" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Open Mediimate →</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;">Need help? Reply to this email or contact us at care@mediimate.com</p>
  `);
  return sendEmail({ to, subject: "Welcome to Mediimate! 🎉", html, template: "welcome", userId });
}

// ─── Template: Vitals Logged ────────────────────────────────────
export async function sendVitalsLoggedEmail(to: string, name: string, vitalType: string, value: string, userId?: string) {
  const html = wrapHtml("Vitals Logged", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your vitals have been recorded successfully:</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <p style="margin:0;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">${vitalType}</p>
      <p style="margin:4px 0 0;font-size:28px;font-weight:800;color:#16a34a;">${value}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Keep logging your vitals daily for better health insights from your doctor.</p>
  `);
  return sendEmail({ to, subject: `Vitals Logged: ${vitalType} — ${value}`, html, template: "vitals_logged", userId, metadata: { vitalType, value } });
}

// ─── Template: Medication Reminder ──────────────────────────────
export async function sendMedicationReminderEmail(to: string, name: string, medicationsOrLabel: string[] | string, descriptionOrUserId?: string, userId?: string) {
  const isList = Array.isArray(medicationsOrLabel);
  const medContent = isList
    ? `<ul style="margin:0;padding-left:20px;">${(medicationsOrLabel as string[]).map(m => `<li style="margin:4px 0;font-size:14px;color:#374151;">${m}</li>`).join("")}</ul>`
    : `<p style="margin:0;font-size:15px;color:#374151;font-weight:600;">${medicationsOrLabel}</p>
       ${descriptionOrUserId && !userId ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${descriptionOrUserId}</p>` : ""}`;
  const actualUserId = isList ? (descriptionOrUserId || undefined) : userId;
  const html = wrapHtml("Health Reminder", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Time for your health log:</p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #f59e0b;">
      ${medContent}
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/patient" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Log Now</a>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Log in the app once done to maintain your streak!</p>
  `);
  return sendEmail({ to, subject: isList ? "Medication Reminder" : `Reminder: ${medicationsOrLabel}`, html, template: "medication_reminder", userId: actualUserId as string | undefined });
}

// ─── Template: Medication Missed ────────────────────────────────
export async function sendMedicationMissedEmail(to: string, name: string, missedDays: number, userId?: string) {
  const html = wrapHtml("Missed Medication Alert", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">We noticed you haven't logged your medications for <strong>${missedDays} day${missedDays > 1 ? "s" : ""}</strong>.</p>
    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #ef4444;">
      <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">Skipping medications can affect your health. Please log your medications today.</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/patient/medications" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Log Medications Now →</a>
    </div>
  `);
  return sendEmail({ to, subject: "⚠️ Missed Medication Alert", html, template: "medication_missed", userId });
}

// ─── Template: Appointment Reminder ─────────────────────────────
export async function sendAppointmentReminderEmail(to: string, name: string, doctorName: string, dateTime: string, userId?: string) {
  const html = wrapHtml("Appointment Reminder", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">You have an upcoming appointment:</p>
    <div style="background:#eff6ff;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Doctor:</strong> ${doctorName}</p>
      <p style="margin:0;font-size:14px;color:#374151;"><strong>When:</strong> ${dateTime}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Please arrive 10 minutes early. Contact your doctor if you need to reschedule.</p>
  `);
  return sendEmail({ to, subject: `Appointment Reminder — ${dateTime}`, html, template: "appointment_reminder", userId });
}

// ─── Template: AI Doctor Consultation Summary ───────────────────
export async function sendConsultationSummaryEmail(to: string, name: string, doctorName: string, summary: string, userId?: string) {
  const html = wrapHtml("AI Doctor Consultation Summary", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Here is a summary of your consultation with <strong>${doctorName}</strong>:</p>
    <div style="background:#f9fafb;border-radius:8px;padding:16px 20px;margin:16px 0;border:1px solid #e5e7eb;">
      <p style="margin:0;font-size:14px;color:#374151;white-space:pre-line;">${summary}</p>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;">This is an AI-generated summary. Always consult your doctor for medical decisions.</p>
  `);
  return sendEmail({ to, subject: `Consultation Summary — ${doctorName}`, html, template: "consultation_summary", userId });
}

// ─── Template: Doctor — New Patient Linked ──────────────────────
export async function sendNewPatientLinkedEmail(to: string, doctorName: string, patientName: string, userId?: string) {
  const html = wrapHtml("New Patient Linked", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi Dr. ${doctorName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">A new patient has connected to your practice:</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <p style="margin:0;font-size:20px;font-weight:700;color:#16a34a;">${patientName}</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/dashboard/patients" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">View Patients →</a>
    </div>
  `);
  return sendEmail({ to, subject: `New Patient: ${patientName}`, html, template: "new_patient_linked", userId });
}

// ─── Template: Doctor — Critical Vitals Alert ───────────────────
export async function sendCriticalVitalsAlertEmail(to: string, doctorName: string, patientName: string, vitalType: string, value: string, userId?: string) {
  const html = wrapHtml("⚠️ Critical Vitals Alert", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi Dr. ${doctorName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">A patient has logged vitals that may need your attention:</p>
    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #ef4444;">
      <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Patient:</strong> ${patientName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>${vitalType}:</strong> <span style="color:#ef4444;font-weight:700;">${value}</span></p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/dashboard/patients" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Review Patient →</a>
    </div>
  `);
  return sendEmail({ to, subject: `⚠️ Alert: ${patientName} — ${vitalType} ${value}`, html, template: "critical_vitals_alert", userId, metadata: { patientName, vitalType, value } });
}

// ─── Template: Doctor — Patient Compliance Report ───────────────
export async function sendWeeklyComplianceEmail(
  to: string,
  doctorName: string,
  patients: { name: string; bp: number; sugar: number; food: number; med: number; streak: number }[],
  userId?: string
) {
  const totalPatients = patients.length;
  const compliant = patients.filter((p) => (p.bp + p.sugar + p.food + p.med) >= 7).length;
  const atRisk = totalPatients - compliant;
  const rows = patients
    .sort((a, b) => (a.bp + a.sugar + a.food + a.med) - (b.bp + b.sugar + b.food + b.med))
    .map((p) => {
      const total = p.bp + p.sugar + p.food + p.med;
      const color = total >= 7 ? "#16a34a" : total >= 3 ? "#f59e0b" : "#ef4444";
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.name}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.bp}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.sugar}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.food}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.med}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:700;color:${color};">${total}</td>
        <td style="padding:8px 8px;text-align:center;border-bottom:1px solid #f3f4f6;font-size:14px;color:#374151;">${p.streak}d</td>
      </tr>`;
    }).join("");
  const html = wrapHtml("Weekly Patient Compliance", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi Dr. ${doctorName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Here is your weekly patient compliance report:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px 0 0 8px;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a;">${totalPatients}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Total Patients</p>
        </td>
        <td style="text-align:center;padding:16px;background:#eff6ff;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#3b82f6;">${compliant}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Compliant</p>
        </td>
        <td style="text-align:center;padding:16px;background:#fef2f2;border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:28px;font-weight:800;color:#ef4444;">${atRisk}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">At Risk</p>
        </td>
      </tr>
    </table>
    ${patients.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Patient</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">BP</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">Sugar</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">Food</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">Med</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">Total</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#6b7280;">Streak</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>` : ""}
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/dashboard/patients" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">View Dashboard</a>
    </div>
  `);
  return sendEmail({ to, subject: `Weekly Report: ${compliant}/${totalPatients} patients compliant`, html, template: "weekly_compliance", userId });
}

// ─── Template: Password Reset ───────────────────────────────────
export async function sendPasswordResetEmail(to: string, code: string, name?: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const html = wrapHtml("Reset Your Password", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">We received a request to reset your password. Use the code below:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#fef3c7;border:2px solid #f59e0b;border-radius:12px;padding:16px 40px;">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#d97706;">${code}</span>
      </div>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This code expires in <strong>10 minutes</strong>.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">If you didn't request this, ignore this email. Your password will remain unchanged.</p>
  `);
  return sendEmail({ to, subject: `${code} — Reset your Mediimate password`, html, template: "password_reset" });
}

// ─── Template: Family Invitation ────────────────────────────────
export async function sendFamilyInvitationEmail(to: string, patientName: string, inviterName: string) {
  const html = wrapHtml("Family Health Access Invitation", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hello,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;"><strong>${inviterName}</strong> has invited you to view <strong>${patientName}</strong>'s health logs on Mediimate.</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;">
      <p style="margin:0;font-size:14px;color:#166534;">As a family member, you can:</p>
      <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:#374151;">
        <li>View daily vitals, medications & food logs</li>
        <li>Get alerts if medications are missed</li>
        <li>Track health progress over time</li>
      </ul>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/auth/patient" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Create Your Account →</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;">If you don't know ${inviterName}, you can safely ignore this email.</p>
  `);
  return sendEmail({ to, subject: `${inviterName} invited you to view health logs on Mediimate`, html, template: "family_invitation" });
}

// ─── Template: Daily Health Summary (Patient) ───────────────────
export async function sendDailyHealthSummaryEmail(to: string, name: string, summary: {
  vitalsCount?: number; mealsLogged?: number; medsLogged?: number; medsMissed?: number; healthScore?: number;
  bp?: number; sugar?: number; food?: number; medication?: number; streak?: number; points?: number; level?: string;
}, userId?: string) {
  // Support both old and new field names
  const bpCount = summary.bp ?? summary.vitalsCount ?? 0;
  const sugarCount = summary.sugar ?? 0;
  const foodCount = summary.food ?? summary.mealsLogged ?? 0;
  const medCount = summary.medication ?? summary.medsLogged ?? 0;
  const streak = summary.streak ?? 0;
  const points = summary.points ?? 0;
  const level = summary.level ?? "";
  const html = wrapHtml("Your Daily Health Summary", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Here is your health summary for today:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr>
        <td style="text-align:center;padding:12px 8px;background:#eff6ff;border-radius:8px 0 0 0;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#3b82f6;">${bpCount}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">BP Logs</p>
        </td>
        <td style="text-align:center;padding:12px 8px;background:#faf5ff;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#7c3aed;">${sugarCount}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Sugar Logs</p>
        </td>
        <td style="text-align:center;padding:12px 8px;background:#fef3c7;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#d97706;">${foodCount}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Meals</p>
        </td>
        <td style="text-align:center;padding:12px 8px;background:#f0fdf4;border-radius:0 8px 0 0;">
          <p style="margin:0;font-size:24px;font-weight:800;color:#16a34a;">${medCount}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#6b7280;">Meds</p>
        </td>
      </tr>
    </table>
    ${streak > 0 || points > 0 ? `
    <div style="background:#fef2f2;border-radius:8px;padding:12px 20px;margin:12px 0;display:flex;justify-content:space-around;text-align:center;">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="text-align:center;padding:8px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#dc2626;">&#128293; ${streak}d</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Streak</p>
        </td>
        <td style="text-align:center;padding:8px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#f59e0b;">${points}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Points</p>
        </td>
        ${level ? `<td style="text-align:center;padding:8px;">
          <p style="margin:0;font-size:16px;font-weight:700;color:#16a34a;">${level}</p>
          <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">Level</p>
        </td>` : ""}
      </tr></table>
    </div>` : ""}
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/patient" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Open Dashboard</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;">Consistency is the key to better health!</p>
  `);
  return sendEmail({ to, subject: "Your Daily Health Summary", html, template: "daily_health_summary", userId });
}

// ─── Template: Food Logged ──────────────────────────────────────
export async function sendFoodLoggedEmail(to: string, name: string, mealType: string, notes: string, userId?: string) {
  const html = wrapHtml("Meal Logged", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your meal has been logged:</p>
    <div style="background:#fef3c7;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #f59e0b;">
      <p style="margin:0 0 4px;font-size:13px;color:#92400e;text-transform:uppercase;letter-spacing:1px;">${mealType}</p>
      <p style="margin:0;font-size:15px;color:#374151;font-weight:600;">${notes || "Logged successfully"}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Keep tracking your meals for better nutrition insights!</p>
  `);
  return sendEmail({ to, subject: `Meal Logged: ${mealType}`, html, template: "food_logged", userId });
}

// ─── Template: Medication Logged ────────────────────────────────
export async function sendMedicationLoggedEmail(to: string, name: string, medName: string, taken: boolean, userId?: string) {
  const statusText = taken ? "Taken" : "Skipped";
  const statusColor = taken ? "#16a34a" : "#ef4444";
  const statusBg = taken ? "#f0fdf4" : "#fef2f2";
  const html = wrapHtml("Medication Logged", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your medication log has been recorded:</p>
    <div style="background:${statusBg};border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">${medName || "Medication"}</p>
      <p style="margin:0;font-size:24px;font-weight:800;color:${statusColor};">${statusText}</p>
    </div>
    ${!taken ? '<p style="margin:0;font-size:14px;color:#ef4444;">Skipping medications can impact your health. Please consult your doctor if you have concerns.</p>' : '<p style="margin:0;font-size:14px;color:#6b7280;">Great job staying on track with your medications!</p>'}
  `);
  return sendEmail({ to, subject: `Medication ${statusText}: ${medName || "Logged"}`, html, template: "medication_logged", userId });
}

// ─── Template: Doctor Sent You a Message ────────────────────────
export async function sendDoctorMessageEmail(to: string, patientName: string, doctorName: string, message: string, userId?: string) {
  const html = wrapHtml("Message from Your Doctor", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${patientName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">You have a new message from <strong>${doctorName}</strong>:</p>
    <div style="background:#eff6ff;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #3b82f6;">
      <p style="margin:0;font-size:15px;color:#374151;white-space:pre-line;">${message}</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/patient" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Open Mediimate →</a>
    </div>
  `);
  return sendEmail({ to, subject: `Message from ${doctorName}`, html, template: "doctor_message", userId });
}

// ─── Template: Appointment Booked ───────────────────────────────
export async function sendAppointmentBookedEmail(to: string, name: string, title: string, dateTime: string, userId?: string) {
  const html = wrapHtml("Appointment Booked", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your appointment has been confirmed and scheduled successfully:</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #16a34a;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>${title || "Appointment"}</strong></p>
      <p style="margin:0;font-size:14px;color:#374151;">${dateTime}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">We'll send you a reminder before your appointment.</p>
  `);
  return sendEmail({ to, subject: `Appointment Confirmed: ${title || "Upcoming"}`, html, template: "appointment_booked", userId });
}

// ─── Template: Appointment Requested (Patient) ──────────────────
export async function sendAppointmentRequestedEmail(to: string, name: string, title: string, dateTime: string, userId?: string) {
  const html = wrapHtml("Appointment Request Received", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your appointment request has been submitted successfully and is pending doctor approval:</p>
    <div style="background:#eff6ff;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>${title || "Appointment"}</strong></p>
      <p style="margin:0;font-size:14px;color:#374151;">${dateTime}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">We will notify you by email as soon as your doctor reviews and approves the request.</p>
  `);
  return sendEmail({ to, subject: `Appointment Request Submitted: ${title || "Visit"}`, html, template: "appointment_requested", userId });
}

// ─── Template: Appointment Request Doctor Notification ─────────
export async function sendAppointmentRequestDoctorEmail(to: string, doctorName: string, patientName: string, title: string, dateTime: string, userId?: string) {
  const html = wrapHtml("New Appointment Request", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi Dr. ${doctorName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">A patient has requested a new appointment slot:</p>
    <div style="background:#eff6ff;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Patient:</strong> ${patientName}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>Reason:</strong> ${title}</p>
      <p style="margin:0;font-size:14px;color:#374151;"><strong>Requested Slot:</strong> ${dateTime}</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.in/dashboard/appointments" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Review Request →</a>
    </div>
  `);
  return sendEmail({ to, subject: `Action Required: New Appointment Request from ${patientName}`, html, template: "appointment_request_doctor", userId });
}

// ─── Template: Appointment Declined (Patient) ───────────────────
export async function sendAppointmentDeclinedEmail(to: string, name: string, title: string, dateTime: string, userId?: string) {
  const html = wrapHtml("Appointment Request Declined", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">We regret to inform you that your doctor is unable to accept your requested appointment slot at this time:</p>
    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #ef4444;">
      <p style="margin:0 0 4px;font-size:14px;color:#374151;"><strong>${title || "Appointment"}</strong></p>
      <p style="margin:0;font-size:14px;color:#374151;">${dateTime}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Please go to the app's Appointments page to choose another available time slot or contact your doctor's office.</p>
  `);
  return sendEmail({ to, subject: `Appointment Request Declined: ${title || "Visit"}`, html, template: "appointment_declined", userId });
}

// ─── Template: Appointment Completed ────────────────────────────
export async function sendAppointmentCompletedEmail(to: string, name: string, title: string, doctorName: string, userId?: string) {
  const html = wrapHtml("Appointment Completed", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your appointment has been marked as completed:</p>
    <div style="background:#f0fdf4;border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">${title || "Appointment"}</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:#16a34a;">Completed ✓</p>
      <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">by ${doctorName}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;">Please share your feedback to help us serve you better.</p>
  `);
  return sendEmail({ to, subject: `Appointment Completed — ${title || "Visit"}`, html, template: "appointment_completed", userId });
}

// ─── Template: Badge Earned ─────────────────────────────────────
export async function sendBadgeEarnedEmail(to: string, name: string, badgeTitle: string, badgeDesc: string, userId?: string) {
  const html = wrapHtml("You Earned a Badge!", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Congratulations! You just earned a new badge:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:linear-gradient(135deg,#fef3c7,#fde68a);border:2px solid #f59e0b;border-radius:16px;padding:24px 40px;">
        <p style="margin:0;font-size:32px;">🏆</p>
        <p style="margin:8px 0 4px;font-size:18px;font-weight:800;color:#92400e;">${badgeTitle}</p>
        <p style="margin:0;font-size:13px;color:#a16207;">${badgeDesc}</p>
      </div>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;text-align:center;">Keep up the amazing work! Your health journey is going great.</p>
  `);
  return sendEmail({ to, subject: `🏆 Badge Earned: ${badgeTitle}`, html, template: "badge_earned", userId });
}

// ─── Template: Streak Milestone ─────────────────────────────────
export async function sendStreakMilestoneEmail(to: string, name: string, streakDays: number, userId?: string) {
  const html = wrapHtml("Streak Milestone!", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">You're on fire! You've hit a logging streak milestone:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:linear-gradient(135deg,#fef2f2,#fee2e2);border:2px solid #ef4444;border-radius:16px;padding:24px 40px;">
        <p style="margin:0;font-size:32px;">🔥</p>
        <p style="margin:8px 0 0;font-size:36px;font-weight:800;color:#dc2626;">${streakDays} Days</p>
        <p style="margin:4px 0 0;font-size:13px;color:#991b1b;">Consecutive Logging Streak</p>
      </div>
    </div>
    <p style="margin:0;font-size:14px;color:#6b7280;text-align:center;">Keep it going — consistency is the key to better health!</p>
  `);
  return sendEmail({ to, subject: `🔥 ${streakDays}-Day Streak! Keep it going!`, html, template: "streak_milestone", userId });
}

// ─── Template: Escalation Reminder (missed logs) ────────────────
export async function sendEscalationReminderEmail(to: string, name: string, missedType: string, dayNumber: number, userId?: string) {
  const typeLabel = missedType === "blood_pressure" ? "Blood Pressure" : missedType === "blood_sugar" ? "Blood Sugar" : "Medication";
  const urgency = dayNumber >= 3 ? "high" : dayNumber >= 2 ? "medium" : "low";
  const urgencyColor = urgency === "high" ? "#ef4444" : urgency === "medium" ? "#f59e0b" : "#3b82f6";
  const urgencyBg = urgency === "high" ? "#fef2f2" : urgency === "medium" ? "#fef3c7" : "#eff6ff";
  const html = wrapHtml(`${typeLabel} Reminder`, `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">We noticed you haven't logged your <strong>${typeLabel}</strong> for <strong>${dayNumber} day${dayNumber > 1 ? "s" : ""}</strong>.</p>
    <div style="background:${urgencyBg};border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid ${urgencyColor};">
      <p style="margin:0;font-size:14px;color:#374151;font-weight:600;">
        ${dayNumber === 1 ? "A gentle reminder to log today." : dayNumber <= 3 ? "Please log your " + typeLabel + " — your doctor may be notified soon." : "Your doctor has been notified. Please log as soon as possible."}
      </p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/patient" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Log Now →</a>
    </div>
  `);
  return sendEmail({ to, subject: `${dayNumber >= 3 ? "⚠️ " : ""}Reminder: Log your ${typeLabel} (Day ${dayNumber})`, html, template: "escalation_reminder", userId, metadata: { missedType, dayNumber } });
}

// ─── Template: Doctor — Patient Missed Alert (Day 5) ────────────
export async function sendDoctorPatientMissedAlertEmail(to: string, doctorName: string, patientName: string, missedType: string, days: number, userId?: string) {
  const typeLabel = missedType === "blood_pressure" ? "Blood Pressure" : missedType === "blood_sugar" ? "Blood Sugar" : "Medication";
  const html = wrapHtml("Patient Alert", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi Dr. ${doctorName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Your patient <strong>${patientName}</strong> has not logged <strong>${typeLabel}</strong> for <strong>${days}+ days</strong>.</p>
    <div style="background:#fef2f2;border-radius:8px;padding:16px 20px;margin:16px 0;border-left:4px solid #ef4444;">
      <p style="margin:0;font-size:14px;color:#991b1b;font-weight:600;">This patient may need follow-up. All automated reminders have been sent.</p>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.com/dashboard/patients" style="display:inline-block;background:#ef4444;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">View Patient →</a>
    </div>
  `);
  return sendEmail({ to, subject: `⚠️ ${patientName} — ${typeLabel} not logged for ${days}+ days`, html, template: "doctor_patient_missed", userId });
}

// ─── Template: Login OTP ────────────────────────────────────────
export async function sendLoginOTPEmail(to: string, code: string, name?: string) {
  const greeting = name ? `Hi ${name},` : "Hi,";
  const html = wrapHtml("Your Login Code", `
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;">Use the code below to sign in to your Mediimate account:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:16px 40px;">
        <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#16a34a;">${code}</span>
      </div>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">This code expires in <strong>10 minutes</strong>.</p>
    <p style="margin:0;font-size:14px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
  `);
  return sendEmail({ to, subject: `${code} — Your Mediimate login code`, html, template: "login_otp" });
}


// ─── Approval Email Templates ───────────────────────────────────

export async function sendClinicApprovedEmail(to: string, clinicName: string) {
  const html = wrapHtml("Clinic Approved", `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Welcome to Mediimate!</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Great news, <strong>${clinicName}</strong>! Your clinic account has been approved by the Mediimate admin team.</p>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">You can now log in and start managing your clinic, doctors, and patient programs.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.in/auth/doctor" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Log In Now</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;">If you have questions, contact us at support@mediimate.com.</p>
  `);
  return sendEmail({ to, subject: "Your Mediimate Clinic Account is Approved!", html, template: "clinic_approved" });
}

export async function sendClinicRejectedEmail(to: string, clinicName: string, reason?: string) {
  const reasonText = reason ? `<p style="margin:0 0 12px;font-size:15px;color:#374151;"><strong>Reason:</strong> ${reason}</p>` : "";
  const html = wrapHtml("Clinic Application Update", `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Application Update</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Dear <strong>${clinicName}</strong>, we regret to inform you that your clinic account application has not been approved at this time.</p>
    ${reasonText}
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">If you believe this is an error or would like to reapply, please contact us at support@mediimate.com.</p>
  `);
  return sendEmail({ to, subject: "Mediimate Clinic Application Update", html, template: "clinic_rejected" });
}

export async function sendDoctorApprovedEmail(to: string, doctorName: string) {
  const html = wrapHtml("Doctor Account Approved", `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Welcome to Mediimate!</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Congratulations, <strong>Dr. ${doctorName}</strong>! Your doctor account has been approved.</p>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">You can now log in and start managing your patients and programs.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://mediimate.in/auth/doctor" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Log In Now</a>
    </div>
  `);
  return sendEmail({ to, subject: "Your Mediimate Doctor Account is Approved!", html, template: "doctor_approved" });
}

export async function sendDoctorRejectedEmail(to: string, doctorName: string, reason?: string) {
  const reasonText = reason ? `<p style="margin:0 0 12px;font-size:15px;color:#374151;"><strong>Reason:</strong> ${reason}</p>` : "";
  const html = wrapHtml("Doctor Application Update", `
    <h2 style="margin:0 0 16px;font-size:20px;color:#111827;">Application Update</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Dear <strong>Dr. ${doctorName}</strong>, we regret to inform you that your doctor account application has not been approved at this time.</p>
    ${reasonText}
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">If you have questions, please contact us at support@mediimate.com.</p>
  `);
  return sendEmail({ to, subject: "Mediimate Doctor Application Update", html, template: "doctor_rejected" });
}

export async function sendAccountSuspendedEmail(to: string, name: string, reason?: string) {
  const reasonText = reason ? `<p style="margin:0 0 12px;font-size:15px;color:#374151;"><strong>Reason:</strong> ${reason}</p>` : "";
  const html = wrapHtml("Account Suspended", `
    <h2 style="margin:0 0 16px;font-size:20px;color:#dc2626;">Account Suspended</h2>
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">Dear <strong>${name}</strong>, your Mediimate account has been suspended.</p>
    ${reasonText}
    <p style="margin:0 0 12px;font-size:15px;color:#374151;">If you believe this is an error, please contact support@mediimate.com.</p>
  `);
  return sendEmail({ to, subject: "Mediimate Account Suspended", html, template: "account_suspended" });
}

export function isEmailConfigured(): boolean {
  return isConfigured;
}
