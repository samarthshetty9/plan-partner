import { useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Link } from "react-router-dom";
import { Stethoscope, Eye, EyeOff, Mail, KeyRound, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, setStoredToken } from "@/lib/api";

const AuthDoctor = () => {
  const { user, loading, role, signIn, signUp, signOut, refreshSession } = useAuth();
  const { toast } = useToast();
  const [isLogin, setIsLogin] = useState(true);
  const [loginMethod, setLoginMethod] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otpCode, setOtpCode] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState<"doctor" | "clinic">("doctor");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [submittedRole, setSubmittedRole] = useState<"doctor" | "clinic">("doctor");

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (!submitted && user && role && (role === "doctor" || role === "clinic" || role === "admin")) {
    const to = role === "admin" ? "/admin" : role === "clinic" ? "/clinic" : "/dashboard";
    return <Navigate to={to} replace />;
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-heading font-bold text-foreground">Request Submitted!</h1>
            <p className="text-muted-foreground">
              Your {submittedRole === "clinic" ? "clinic" : "doctor"} account request has been submitted successfully.
            </p>
          </div>
          <div className="glass-card rounded-2xl p-6 space-y-3 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium text-foreground">{submittedEmail}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Account Type</span>
              <span className="font-medium text-foreground capitalize">{submittedRole}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Pending Approval</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            The Mediimate admin team will review your request. You'll receive an email at <strong>{submittedEmail}</strong> once your account is approved.
          </p>
          <div className="space-y-3 pt-2">
            <button
              onClick={() => { setSubmitted(false); setIsLogin(true); signOut(); }}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Back to Sign In
            </button>
            <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleOtpChange = (idx: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const newCode = [...otpCode];
    newCode[idx] = val.slice(-1);
    setOtpCode(newCode);
    if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
  };
  const handleOtpKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpCode[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) { setOtpCode(text.split("")); otpRefs.current[5]?.focus(); e.preventDefault(); }
  };

  const startCooldown = () => {
    setResendCooldown(60);
    const tick = setInterval(() => setResendCooldown((p) => { if (p <= 1) { clearInterval(tick); return 0; } return p - 1; }), 1000);
  };

  const handleRequestOTP = async () => {
    if (!email.trim()) { toast({ title: "Email is required", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      await api.post("auth/login-otp-request", { email: email.trim() });
      setOtpStep("code");
      startCooldown();
      toast({ title: "Code sent!", description: "Check your email for the login code." });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = otpCode.join("");
    if (code.length !== 6) { toast({ title: "Enter the 6-digit code", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await api.post<{ token: string; user: { id: string; email: string }; email_verified: boolean }>("auth/login-otp-verify", { email: email.trim(), code });
      setStoredToken(res.token);
      await refreshSession();
      toast({ title: "Signed in!" });
    } catch (err: any) {
      toast({ title: "Verification failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;
    try {
      await api.post("auth/login-otp-request", { email: email.trim() });
      startCooldown();
      toast({ title: "Code resent!" });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) toast({ title: "Login failed", description: "Invalid email or password.", variant: "destructive" });
      } else {
        if (selectedRole === "clinic") {
          if (!clinicName.trim()) { toast({ title: "Clinic name is required", variant: "destructive" }); setSubmitting(false); return; }
          if (!fullName.trim()) { toast({ title: "Owner name is required", variant: "destructive" }); setSubmitting(false); return; }
          if (!clinicAddress.trim()) { toast({ title: "Clinic address is required", variant: "destructive" }); setSubmitting(false); return; }
          if (!clinicPhone.trim()) { toast({ title: "Phone number is required", variant: "destructive" }); setSubmitting(false); return; }
        } else {
          if (!fullName.trim()) { toast({ title: "Full name is required", variant: "destructive" }); setSubmitting(false); return; }
          if (!phone.trim()) { toast({ title: "Phone number is required", variant: "destructive" }); setSubmitting(false); return; }
        }
        if (!email.trim()) { toast({ title: "Email is required", variant: "destructive" }); setSubmitting(false); return; }
        if (password.length < 6) { toast({ title: "Password must be at least 6 characters", variant: "destructive" }); setSubmitting(false); return; }
        const phoneValue = selectedRole === "clinic" ? clinicPhone.trim() : phone.trim();
        const body: Record<string, unknown> = {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          role: selectedRole,
          phone: phoneValue,
        };
        if (selectedRole === "clinic") {
          body.clinic_name = clinicName.trim();
          body.address = clinicAddress.trim();
        }
        try {
          await api.post("auth/register", body);
          setSubmittedEmail(email.trim());
          setSubmittedRole(selectedRole);
          setSubmitted(true);
        } catch (err: any) {
          toast({ title: "Signup failed", description: err?.message || "Something went wrong", variant: "destructive" });
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (isLogin && loginMethod === "otp") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
              {otpStep === "email" ? "Login with Email OTP" : "Enter Login Code"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {otpStep === "email" ? "We'll send a code to your email" : <>Code sent to <strong className="text-foreground">{email}</strong></>}
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-4">
            {otpStep === "email" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="email@example.com" onKeyDown={(e) => e.key === "Enter" && handleRequestOTP()} />
                </div>
                <button onClick={handleRequestOTP} disabled={submitting}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                  {submitting ? "Sending..." : "Send Login Code"}
                </button>
              </>
            ) : (
              <>
                <div className="flex justify-center gap-1.5 sm:gap-2" onPaste={handleOtpPaste}>
                  {otpCode.map((digit, idx) => (
                    <input key={idx} ref={el => { otpRefs.current[idx] = el; }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={e => handleOtpChange(idx, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(idx, e)}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl font-bold rounded-lg border-2 border-border bg-background text-foreground focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all"
                      autoFocus={idx === 0} />
                  ))}
                </div>
                <button onClick={handleVerifyOTP} disabled={submitting || otpCode.join("").length !== 6}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                  {submitting ? "Verifying..." : "Verify & Sign In"}
                </button>
                <div className="text-center">
                  <button onClick={handleResendOTP} disabled={resendCooldown > 0}
                    className="text-sm text-muted-foreground hover:text-primary disabled:opacity-50">
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="space-y-3 text-center">
            <button onClick={() => { setLoginMethod("password"); setOtpStep("email"); setOtpCode(["","","","","",""]); }}
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
              <KeyRound className="w-3.5 h-3.5" /> Login with password instead
            </button>
            <p className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <button onClick={() => { setIsLogin(false); setLoginMethod("password"); }} className="text-primary font-medium hover:underline">Sign up</button>
            </p>
            <p className="text-sm text-muted-foreground">
              Not a doctor? <Link to="/auth/patient" className="text-primary font-medium hover:underline">Patient / Family login</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto">
            <Stethoscope className="w-6 h-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            {isLogin ? "Doctor / Clinic Login" : "Create Doctor / Clinic Account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Sign in to your practice dashboard" : "Set up your practice on Mediimate"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-5 sm:p-8 space-y-4">
          {!isLogin && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">I am a</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSelectedRole("doctor")}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-colors border ${selectedRole === "doctor" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
                    Doctor
                  </button>
                  <button type="button" onClick={() => setSelectedRole("clinic")}
                    className={`py-2.5 rounded-lg text-sm font-medium transition-colors border ${selectedRole === "clinic" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}>
                    Clinic
                  </button>
                </div>
              </div>
              {selectedRole === "clinic" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Clinic Name <span className="text-red-500">*</span></label>
                    <input type="text" required value={clinicName} onChange={(e) => setClinicName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. City Care Clinic" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Owner / Doctor Name <span className="text-red-500">*</span></label>
                    <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g. Dr. Abhay Desai" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Address <span className="text-red-500">*</span></label>
                    <input type="text" required value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Street, City, State" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Phone <span className="text-red-500">*</span></label>
                    <input type="tel" required value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="+91 98765 43210" />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Full Name <span className="text-red-500">*</span></label>
                    <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Dr. Sharma" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground">Phone <span className="text-red-500">*</span></label>
                    <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="+91 98765 43210" />
                  </div>
                </>
              )}
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email <span className="text-red-500">*</span></label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="email@example.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Password <span className="text-red-500">*</span></label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 pr-10"
                placeholder="Min 6 characters" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {submitting ? "Please wait..." : isLogin ? "Sign In" : "Create Account"}
          </button>

          {isLogin && (
            <>
              <div className="text-center pt-1">
                <button type="button" onClick={() => setLoginMethod("otp")}
                  className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline">
                  <Mail className="w-3.5 h-3.5" /> Login with Email OTP instead
                </button>
              </div>
              <div className="text-center">
                <Link to="/auth/forgot-password" className="text-sm text-muted-foreground hover:text-primary">Forgot password?</Link>
              </div>
            </>
          )}
        </form>

        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
          <p className="text-sm text-muted-foreground">
            Not a doctor? <Link to="/auth/patient" className="text-primary font-medium hover:underline">Go to Patient / Family login</Link>
          </p>
          <Link to="/auth" className="inline-block text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to role selection
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AuthDoctor;
