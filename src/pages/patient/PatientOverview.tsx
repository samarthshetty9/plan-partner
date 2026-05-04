import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, getStoredToken } from "@/lib/api";
import { Activity, FileText, CalendarDays, TrendingUp, Heart, Search, CheckCircle, Clock, Send, Edit3, Save, X, UtensilsCrossed, ImagePlus, Sparkles, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { useRewards, HealthScore, TodayProgress } from "@/components/RewardsSection";
import { useGamification, GamificationBlock } from "@/components/GamificationSection";
import { showPointsEarned } from "@/lib/rewards";

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "other", label: "Other" },
] as const;

const PatientOverview = () => {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patientFromSession = session?.patient as any;
  const [patientData, setPatientData] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["me", "overview", user?.id, patientFromSession?.id],
    queryFn: async () => {
      if (!patientFromSession) {
        const list = await api.get<any[]>("me/link_requests").catch(() => []);
        return { linkRequest: list?.[0] ?? null, enrollments: [], upcomingAppts: [], recentVitals: [], foodLogs: [] };
      }
      const [enrollList, apptList, vitalsList, logsList] = await Promise.all([
        api.get<any[]>("me/enrollments").catch(() => []),
        api.get<any[]>("me/appointments").catch(() => []),
        api.get<any[]>("me/vitals").catch(() => []),
        api.get<any[]>("me/food_logs").catch(() => []),
      ]);
      const enrollments = Array.isArray(enrollList) ? enrollList.map((e: any) => ({ ...e, adherence_pct: e.adherence_pct ? Number(e.adherence_pct) : null })) : [];
      const upcomingAppts = Array.isArray(apptList) ? apptList.filter((a: any) => new Date(a.scheduled_at) >= new Date()).slice(0, 5) : [];
      const recentVitals = Array.isArray(vitalsList) ? vitalsList.slice(0, 5) : [];
      const foodLogs = Array.isArray(logsList) ? logsList : [];
      return { linkRequest: null, enrollments, upcomingAppts, recentVitals, foodLogs };
    },
    enabled: !!user,
  });

  const enrollments = data?.enrollments ?? [];
  const upcomingAppts = data?.upcomingAppts ?? [];
  const recentVitals = data?.recentVitals ?? [];
  const foodLogs = data?.foodLogs ?? [];
  const linkRequest = data?.linkRequest ?? null;
  const loading = isLoading;
  const { data: rewards } = useRewards(!!user && !!patientFromSession);
  const { data: gamification } = useGamification(!!user && !!patientFromSession);

  useEffect(() => {
    setPatientData(patientFromSession ?? null);
  }, [patientFromSession]);

  // Health profile editing
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ medications: "", conditions: "", emergency_contact: "" });
  const [savingProfile, setSavingProfile] = useState(false);

  // Link request form state
  const [doctorCode, setDoctorCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Log meal from dashboard
  const [mealType, setMealType] = useState<typeof MEAL_TYPES[number]["value"]>("lunch");
  const [mealNotes, setMealNotes] = useState("");
  const [mealImageFile, setMealImageFile] = useState<File | null>(null);
  const [mealImagePreview, setMealImagePreview] = useState<string | null>(null);
  const [analyzingMeal, setAnalyzingMeal] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [mealFoodItems, setMealFoodItems] = useState<{ name: string; quantity?: number; unit?: string; calories?: number; protein?: number; carbs?: number; fat?: number }[]>([]);

  const resetMealForm = useCallback(() => {
    setMealType("lunch");
    setMealNotes("");
    setMealImageFile(null);
    setMealImagePreview(null);
    setMealFoodItems([]);
  }, []);

  const handleMealImageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setMealImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setMealImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    setMealFoodItems([]);
  }, []);

  const handleAnalyzeMealImage = useCallback(async () => {
    if (!mealImageFile || !user) return;
    setAnalyzingMeal(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64Part = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64Part || "");
        };
        reader.onerror = reject;
        reader.readAsDataURL(mealImageFile);
      });
      const result = await api.post<{ meal_type?: string; food_items?: typeof mealFoodItems; notes?: string }>("analyze-meal-image", {
        image_base64: base64,
        mime_type: mealImageFile.type,
      });
      if (result.meal_type) setMealType(result.meal_type as typeof mealType);
      if (result.notes) setMealNotes(result.notes);
      if (Array.isArray(result.food_items)) setMealFoodItems(result.food_items);
      toast({ title: "Meal analyzed", description: "Food items and meal type have been filled." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNotConfigured = /GEMINI_API_KEY|not configured/i.test(msg);
      toast({
        title: "Analysis failed",
        description: isNotConfigured
          ? "AI analysis is not set up on the server. You can still log your meal by entering details below."
          : msg,
        variant: "destructive",
      });
    } finally {
      setAnalyzingMeal(false);
    }
  }, [mealImageFile, user, toast]);

  const handleLogMeal = useCallback(async () => {
    if (!user || !patientData) return;
    setSavingMeal(true);
    try {
      let imagePath: string | undefined;
      if (mealImageFile) {
        const formData = new FormData();
        formData.append("file", mealImageFile);
        const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
        const res = await fetch(`${API_BASE}/me/meal-image-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getStoredToken()}`, "X-Authorization": `Bearer ${getStoredToken()}` },
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const { path } = await res.json();
        imagePath = path;
      }
      const resMeal = await api.post("me/food_logs", {
        meal_type: mealType,
        notes: mealNotes.trim() || undefined,
        food_items: mealFoodItems.length > 0 ? mealFoodItems : undefined,
        image_path: imagePath,
      }) as { points_earned?: number };
      toast({ title: "Meal logged", description: "Your meal has been saved." });
      showPointsEarned(resMeal, toast);
      resetMealForm();
      queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      queryClient.invalidateQueries({ queryKey: ["me", "rewards"] });
      queryClient.invalidateQueries({ queryKey: ["me", "gamification"] });
    } catch (err) {
      toast({ title: "Failed to log meal", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingMeal(false);
    }
  }, [user, patientData, mealType, mealNotes, mealFoodItems, mealImageFile, resetMealForm, toast, queryClient]);

  const handleLinkRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !doctorCode.trim()) return;
    setSubmitting(true);
    try {
      await api.post("me/link_requests", { doctor_code: doctorCode.trim(), message: message || null });
      toast({ title: "Request sent!", description: "Your link request has been sent to the doctor." });
      queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  if (!patientData) {
    // Show link request form or pending status
    if (linkRequest?.status === "pending") {
      return (
        <div className="glass-card rounded-xl p-6 sm:p-12 text-center">
          <Clock className="w-12 h-12 text-accent mx-auto mb-4" />
          <h2 className="text-xl font-heading font-bold text-foreground mb-2">Request Pending</h2>
          <p className="text-muted-foreground mb-1">Your link request has been sent to your doctor.</p>
          <p className="text-sm text-muted-foreground">You'll gain access once your doctor approves it.</p>
        </div>
      );
    }

    if (linkRequest?.status === "denied") {
      return (
        <div className="glass-card rounded-xl p-6 sm:p-12 text-center space-y-4">
          <Heart className="w-12 h-12 text-destructive mx-auto" />
          <h2 className="text-xl font-heading font-bold text-foreground">Request Denied</h2>
          <p className="text-muted-foreground">Your previous request was denied. You can try again with the correct doctor code.</p>
          <button onClick={() => setLinkRequest(null)} className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            Try Again
          </button>
        </div>
      );
    }

    return (
      <div className="w-full sm:max-w-md sm:mx-auto space-y-6">
        <div className="glass-card rounded-xl p-8 text-center space-y-4">
          <Search className="w-12 h-12 text-primary mx-auto" />
          <h2 className="text-xl font-heading font-bold text-foreground">Connect to Your Doctor</h2>
          <p className="text-muted-foreground text-sm">Enter your doctor's code to request access to your health records.</p>
        </div>
        <form onSubmit={handleLinkRequest} className="glass-card rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Doctor Code</label>
            <input
              required
              placeholder="e.g. A1B2C3"
              value={doctorCode}
              onChange={e => setDoctorCode(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-center text-lg font-heading tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Message (optional)</label>
            <input
              placeholder="e.g. My name on file is Jane Smith"
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !doctorCode.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Sending..." : "Send Link Request"}
          </button>
        </form>
      </div>
    );
  }

  const avgAdherence = enrollments.length > 0
    ? Math.round(enrollments.reduce((s, e) => s + (e.adherence_pct ?? 0), 0) / enrollments.length)
    : null;

  return (
    <div className="w-full max-w-full min-w-0 overflow-x-hidden space-y-5 sm:space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Hello, {patientData.full_name}</h1>
        <p className="text-muted-foreground text-sm mt-1">Your health overview</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-card rounded-xl p-3 sm:p-4 text-center min-w-0">
          <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-primary mx-auto mb-1 flex-shrink-0" />
          <p className="text-lg sm:text-2xl font-heading font-bold text-foreground tabular-nums">{enrollments.length}</p>
          <p className="text-xs text-muted-foreground">Programs</p>
        </div>
        <div className="glass-card rounded-xl p-3 sm:p-4 text-center min-w-0">
          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-whatsapp mx-auto mb-1 flex-shrink-0" />
          <p className="text-lg sm:text-2xl font-heading font-bold text-foreground tabular-nums">{avgAdherence !== null ? `${avgAdherence}%` : "—"}</p>
          <p className="text-xs text-muted-foreground">Adherence</p>
        </div>
        <div className="glass-card rounded-xl p-3 sm:p-4 text-center min-w-0">
          <CalendarDays className="w-4 h-4 sm:w-5 sm:h-5 text-accent mx-auto mb-1 flex-shrink-0" />
          <p className="text-lg sm:text-2xl font-heading font-bold text-foreground tabular-nums">{upcomingAppts.length}</p>
          <p className="text-xs text-muted-foreground">Upcoming Appts</p>
        </div>
        <div className="glass-card rounded-xl p-3 sm:p-4 text-center min-w-0">
          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-primary mx-auto mb-1 flex-shrink-0" />
          <p className="text-lg sm:text-2xl font-heading font-bold text-foreground tabular-nums">{recentVitals.length}</p>
          <p className="text-xs text-muted-foreground">Recent Vitals</p>
        </div>
      </div>

      {/* Health score & today's progress */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 min-w-0">
        <HealthScore data={rewards} />
        <TodayProgress data={rewards} />
      </div>

      {/* Gamification: streak, level, badges, weekly challenges */}
      {gamification != null && (
        <div className="min-w-0">
          <h2 className="font-heading font-semibold text-foreground mb-3">Your progress</h2>
          <GamificationBlock data={gamification} />
        </div>
      )}

      {/* Log meal from dashboard */}
      <div className="glass-card rounded-xl p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-primary flex-shrink-0" />
          Log meal
        </h3>
        <p className="text-sm text-muted-foreground">Upload a photo of your meal for AI analysis, or add details manually.</p>

        {/* Meal type segregation */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Meal type</label>
          <div className="flex flex-wrap gap-2">
            {MEAL_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setMealType(t.value)}
                className={`min-h-[44px] px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                  mealType === t.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Image upload + preview */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">Meal photo (optional)</label>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <label className="flex flex-col items-center justify-center w-full sm:w-40 h-32 rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleMealImageChange}
              />
              {mealImagePreview ? (
                <img src={mealImagePreview} alt="Meal" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <>
                  <ImagePlus className="w-8 h-8 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">Upload image</span>
                </>
              )}
            </label>
            {mealImageFile && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleAnalyzeMealImage}
                  disabled={analyzingMeal}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 disabled:opacity-50"
                >
                  {analyzingMeal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {analyzingMeal ? "Analyzing..." : "Analyze with AI"}
                </button>
                <button
                  type="button"
                  onClick={() => { setMealImageFile(null); setMealImagePreview(null); setMealFoodItems([]); }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove photo
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">What did you eat? (optional)</label>
          <textarea
            placeholder="e.g. Rice, dal, vegetables — or use Analyze with AI to fill from photo"
            value={mealNotes}
            onChange={(e) => setMealNotes(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm min-h-[72px] focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {mealFoodItems.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Detected items</p>
            <p className="text-sm text-foreground">{mealFoodItems.map((i) => i.name).join(", ")}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={handleLogMeal}
            disabled={savingMeal}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 disabled:opacity-50 touch-manipulation"
          >
            {savingMeal ? <Loader2 className="w-4 h-4 animate-spin" /> : <UtensilsCrossed className="w-4 h-4" />}
            {savingMeal ? "Saving..." : "Log meal"}
          </button>
          <button
            type="button"
            onClick={resetMealForm}
            className="min-h-[44px] px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted touch-manipulation"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Previous meal logs */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-primary" />
          Previous meal logs
        </h3>
        {foodLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meals logged yet. Log a meal above to see it here.</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {foodLogs.map((log) => {
              const items = Array.isArray(log.food_items) ? log.food_items : [];
              const names = items.map((i: { name?: string }) => i?.name).filter(Boolean).join(", ");
              const summary = names || log.notes || "—";
              return (
                <div key={log.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground capitalize">{log.meal_type || "Meal"}</p>
                    <p className="text-xs text-muted-foreground truncate" title={summary}>{summary}</p>
                    {(log.total_calories != null && log.total_calories > 0) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                        🔥 {Math.round(log.total_calories)} kcal
                        {log.total_protein != null && log.total_protein > 0 && ` · ${Math.round(log.total_protein)}g protein`}
                        {log.total_carbs != null && log.total_carbs > 0 && ` · ${Math.round(log.total_carbs)}g carbs`}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">{format(new Date(log.logged_at), "MMM d, yyyy 'at' HH:mm")}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Health Info - Editable */}
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-foreground">Health Profile</h3>
          {!editingProfile ? (
            <button
              onClick={() => {
                setProfileForm({
                  medications: patientData.medications?.join("; ") || "",
                  conditions: patientData.conditions?.join("; ") || "",
                  emergency_contact: patientData.emergency_contact || "",
                });
                setEditingProfile(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Edit3 className="w-3 h-3" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditingProfile(false)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
              <button
                disabled={savingProfile}
                onClick={async () => {
                  if (!patientData?.id) return;
                  setSavingProfile(true);
                  try {
                    await api.patch("me/patient", {
                      medications: profileForm.medications ? profileForm.medications.split(";").map(m => m.trim()).filter(Boolean) : [],
                      conditions: profileForm.conditions ? profileForm.conditions.split(";").map(c => c.trim()).filter(Boolean) : [],
                      emergency_contact: profileForm.emergency_contact || null,
                    });
                    toast({ title: "Profile updated" });
                    setPatientData({
                      ...patientData,
                      medications: profileForm.medications ? profileForm.medications.split(";").map(m => m.trim()).filter(Boolean) : [],
                      conditions: profileForm.conditions ? profileForm.conditions.split(";").map(c => c.trim()).filter(Boolean) : [],
                      emergency_contact: profileForm.emergency_contact || null,
                    });
                    setEditingProfile(false);
                  } catch (err) {
                    toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
                  } finally {
                    setSavingProfile(false);
                  }
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-50"
              >
                <Save className="w-3 h-3" /> {savingProfile ? "Saving..." : "Save"}
              </button>
            </div>
          )}
        </div>

        {editingProfile ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Conditions (semicolon-separated)</label>
              <input
                value={profileForm.conditions}
                onChange={(e) => setProfileForm({ ...profileForm, conditions: e.target.value })}
                placeholder="e.g. Diabetes; Hypertension"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Medications (semicolon-separated)</label>
              <input
                value={profileForm.medications}
                onChange={(e) => setProfileForm({ ...profileForm, medications: e.target.value })}
                placeholder="e.g. Metformin 500mg; Amlodipine 5mg"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Emergency Contact</label>
              <input
                value={profileForm.emergency_contact}
                onChange={(e) => setProfileForm({ ...profileForm, emergency_contact: e.target.value })}
                placeholder="e.g. Rahul Sharma - 9876543210"
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Conditions</p>
              <div className="flex flex-wrap gap-1.5">
                {patientData.conditions?.length ? patientData.conditions.map((c: string) => (
                  <span key={c} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{c}</span>
                )) : <span className="text-sm text-muted-foreground">None recorded</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Medications</p>
              <p className="text-xs text-muted-foreground mb-1.5">Your doctor sees this list. Log when you take them in AI Assistant → Quick Log → Medication.</p>
              <div className="flex flex-wrap gap-1.5">
                {patientData.medications?.length ? patientData.medications.map((m: string) => (
                  <span key={m} className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">{m}</span>
                )) : <span className="text-sm text-muted-foreground">None recorded — click Edit to add</span>}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Emergency Contact</p>
              <p className="text-sm text-foreground">{patientData.emergency_contact || <span className="text-muted-foreground">Not set</span>}</p>
            </div>
            {patientData.consent_given_at && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Consent</p>
                <p className="text-xs text-whatsapp font-medium">✓ Given on {format(new Date(patientData.consent_given_at), "MMM d, yyyy")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming Appointments */}
        <div className="glass-card rounded-xl p-5 space-y-3">
          <h3 className="font-heading font-semibold text-foreground">Upcoming Appointments</h3>
          {upcomingAppts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming appointments.</p>
          ) : (
            <div className="space-y-2">
              {upcomingAppts.map((a) => (
                <div key={a.id} className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1">
                  <p className="font-medium text-sm text-foreground">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(a.scheduled_at), "MMM d, yyyy 'at' HH:mm")} • {a.duration_minutes} min</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Vitals */}
        <div className="glass-card rounded-xl p-5 space-y-3">
          <h3 className="font-heading font-semibold text-foreground">Recent Vitals</h3>
          {recentVitals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vitals recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recentVitals.map((v) => (
                <div key={v.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground capitalize">{v.vital_type.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(v.recorded_at), "MMM d, yyyy")}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-foreground">{v.value_text}</p>
                    {v.unit && <p className="text-xs text-muted-foreground">{v.unit}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PatientOverview;
