import { useState, useRef, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api, getStoredToken } from "@/lib/api";
import { usePushSubscribe } from "@/hooks/usePushSubscribe";
import { Send, Heart, Shield, Menu, Plus, Activity, Droplets, UtensilsCrossed, Pill, Bell, ImagePlus, ChevronLeft, Trophy, Mic, MicOff, Volume2, Gift, X, Target, Award, Flame, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { QuickLogCards, getGreeting, BP_PRESETS, SUGAR_PRESETS, MEAL_OPTIONS, type QuickLogLast } from "@/components/QuickLogSection";
import { useRewards, TodayProgress } from "@/components/RewardsSection";
import { useGamification, StreakBadge, LevelBadge, MilestoneRewardsList, WeeklyChallengesList, BadgesList, type GamificationData } from "@/components/GamificationSection";
import { showPointsEarned } from "@/lib/rewards";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { useVoiceOutput, unlockTTSAudio } from "@/hooks/useVoiceOutput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const VITAL_TYPES = [
  { value: "blood_pressure", label: "Blood Pressure", unit: "mmHg" },
  { value: "heart_rate", label: "Heart Rate", unit: "bpm" },
  { value: "temperature", label: "Temperature", unit: "°F" },
  { value: "weight", label: "Weight", unit: "kg" },
  { value: "blood_sugar", label: "Blood Sugar", unit: "mg/dL" },
  { value: "spo2", label: "SpO2", unit: "%" },
];

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "other", label: "Other" },
];

type Msg = { role: "user" | "assistant"; content: string };

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

const PatientChat = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [patientName, setPatientName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showVitalModal, setShowVitalModal] = useState(false);
  const [showMealModal, setShowMealModal] = useState(false);
  const [vitalForm, setVitalForm] = useState({ vital_type: "heart_rate", value: "", bp_upper: "", bp_lower: "", notes: "" });
  const [mealForm, setMealForm] = useState({ meal_type: "lunch", notes: "" });
  const [savingVital, setSavingVital] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);

  const [showQuickBp, setShowQuickBp] = useState(false);
  const [showQuickSugar, setShowQuickSugar] = useState(false);
  const [showQuickFood, setShowQuickFood] = useState(false);
  const [showQuickMed, setShowQuickMed] = useState(false);
  const [quickBpShowPresets, setQuickBpShowPresets] = useState(false);
  const [quickSugarShowPresets, setQuickSugarShowPresets] = useState(false);
  const [savingQuick, setSavingQuick] = useState(false);
  const [showQuickLogFab, setShowQuickLogFab] = useState(false);
  const [showRewardsPanel, setShowRewardsPanel] = useState(false);

  const [quickFoodStep, setQuickFoodStep] = useState<1 | 2>(1);
  const [quickFoodMealType, setQuickFoodMealType] = useState("");
  const [quickFoodNotes, setQuickFoodNotes] = useState("");
  const [quickFoodFile, setQuickFoodFile] = useState<File | null>(null);
  const [quickFoodPreview, setQuickFoodPreview] = useState<string | null>(null);

  const [medChecks, setMedChecks] = useState<Record<string, Record<string, boolean>>>({ morning: {}, afternoon: {}, evening: {}, night: {} });

  const [searchParams, setSearchParams] = useSearchParams();
  const { data: quickLogLast } = useQuery({
    queryKey: ["me", "quick-log", "last"],
    queryFn: () => api.get<QuickLogLast>("me/quick-log/last"),
    enabled: !!user && !!(session?.patient),
  });

  type Routine = { blood_pressure: { hour_utc: number; minute_utc: number } | null; blood_sugar: { hour_utc: number; minute_utc: number } | null; food: { hour_utc: number; minute_utc: number } | null; medication: { hour_utc: number; minute_utc: number } | null };
  const { data: routine } = useQuery({
    queryKey: ["me", "quick-log", "routine"],
    queryFn: () => api.get<Routine>("me/quick-log/routine"),
    enabled: !!user && !!(session?.patient),
  });

  const { data: medicationsList } = useQuery({
    queryKey: ["me", "medications"],
    queryFn: () => api.get<{ medicine: string; dosage?: string; frequency?: string; timing_display?: string; active?: boolean }[]>("me/medications"),
    enabled: !!user && !!(session?.patient),
  });
  const { data: rewards } = useRewards(!!user && !!(session?.patient));
  const { data: gamification } = useGamification(!!user && !!(session?.patient));
  const medications = (medicationsList || []).map((m) => m.medicine);
  const TIME_SLOTS = [
    { id: "morning", label: "Morning" },
    { id: "afternoon", label: "Afternoon" },
    { id: "evening", label: "Evening" },
    { id: "night", label: "Night" },
  ] as const;

  // Chat conversation persistence
  const conversationIdRef = useRef<string | null>(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  useEffect(() => {
    if (!user || !(session?.patient)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ conversation: { id: string; messages: { role: string; content: string }[] } | null }>("me/chat-conversation");
        if (cancelled) return;
        if (res.conversation && res.conversation.messages?.length > 0) {
          conversationIdRef.current = res.conversation.id;
          setMessages(res.conversation.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
        }
      } catch { /* first load, no conversation yet */ }
      if (!cancelled) setChatLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [user, session?.patient]);

  const saveChatMessages = async (newMsgs: { role: string; content: string }[]) => {
    try {
      const res = await api.post("me/chat-conversation/save", {
        messages: newMsgs,
        conversation_id: conversationIdRef.current || undefined,
      }) as { conversation_id: string };
      if (res.conversation_id) conversationIdRef.current = res.conversation_id;
    } catch { /* best-effort persistence */ }
  };

  const [voiceMode, setVoiceMode] = useState(false);
  const voiceInput = useVoiceInput({
    onFinalTranscript: (text) => {
      if (text.trim()) {
        setInput(text.trim());
        send(text.trim());
      }
    },
  });
  const voiceOutput = useVoiceOutput({ voiceGender: "female" });

  const { subscribe, subscribed, loading: pushLoading, error: pushError, checkSubscribed } = usePushSubscribe();

  useEffect(() => {
    checkSubscribed();
  }, [checkSubscribed]);

  useEffect(() => {
    const p = session?.patient as { full_name?: string } | undefined;
    if (p?.full_name) setPatientName(p.full_name.split(" ")[0] || "");
  }, [session?.patient]);

  useEffect(() => {
    const token = searchParams.get("log_token");
    if (!token || !user) return;
    (async () => {
      try {
        const resToken = await api.post("me/quick-log-from-notification", { token }) as { points_earned?: number };
        toast({ title: "Logged from notification" });
        showPointsEarned(resToken, toast);
        queryClient.invalidateQueries({ queryKey: ["me", "quick-log", "last"] });
        queryClient.invalidateQueries({ queryKey: ["me", "rewards"] });
        queryClient.invalidateQueries({ queryKey: ["me", "gamification"] });
        queryClient.invalidateQueries({ queryKey: ["me", "vitals"] });
        queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
      } catch {
        toast({ title: "Link expired or already used", variant: "destructive" });
      }
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.delete("log_token");
        return p;
      }, { replace: true });
    })();
  }, [searchParams, user, toast, queryClient, setSearchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  };

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || isLoading) return;

    const userMsg: Msg = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    let assistantSoFar = "";

    try {
      const token = getStoredToken();
      const resp = await fetch(`${API_BASE}/chat/patient`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Failed to connect" }));
        const description = err.detail ? `${err.error}: ${err.detail}` : (err.error || "Something went wrong");
        toast({ title: "Error", description, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsertAssistant = (nextChunk: string) => {
        assistantSoFar += nextChunk;
        const content = assistantSoFar;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content } : m));
          }
          return [...prev, { role: "assistant", content }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Flush remaining buffer
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
      // Speak the full response in voice mode
      if (voiceMode && assistantSoFar.trim()) {
        voiceOutput.speak(assistantSoFar.trim());
      }
      // Save the user + assistant message pair to DB for persistence
      if (assistantSoFar.trim()) {
        saveChatMessages([
          { role: "user", content: text },
          { role: "assistant", content: assistantSoFar.trim() },
        ]);
      }
      // Auto-extract and log health data from the user's message
      try {
        const logResult = await api.post("me/chat-extract-and-log", { message: text }) as { logged?: any[] };
        if (logResult.logged && logResult.logged.length > 0) {
          const items = logResult.logged.map((l: any) =>
            l.type === "blood_pressure" ? `BP ${l.value}` :
            l.type === "blood_sugar" ? `Sugar ${l.value}` :
            l.type === "food" ? `Meal logged` :
            l.type === "medication" ? `Medication logged` :
            l.type === "symptom" ? `Symptom logged` : l.type
          ).join(", ");
          toast({ title: "Auto-logged from your message", description: items });
          queryClient.invalidateQueries({ queryKey: ["me", "vitals"] });
          queryClient.invalidateQueries({ queryKey: ["me", "rewards"] });
          queryClient.invalidateQueries({ queryKey: ["me", "gamification"] });
          queryClient.invalidateQueries({ queryKey: ["me", "quick-log", "last"] });
          queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
        }
      } catch { /* extraction is best-effort */ }
    } catch (e) {
      console.error("Chat error:", e);
      toast({ title: "Error", description: "Failed to get response", variant: "destructive" });
    }

    setIsLoading(false);
  };

  const handleLogVital = async () => {
    const isBp = vitalForm.vital_type === "blood_pressure";
    if (isBp ? !vitalForm.bp_upper.trim() || !vitalForm.bp_lower.trim() : !vitalForm.value.trim()) {
      toast({ title: "Enter a value", variant: "destructive" });
      return;
    }
    setSavingVital(true);
    try {
      const vitalInfo = VITAL_TYPES.find((t) => t.value === vitalForm.vital_type);
      const isBp = vitalForm.vital_type === "blood_pressure";
      const valueText = isBp ? `${vitalForm.bp_upper.trim()}/${vitalForm.bp_lower.trim()}` : vitalForm.value.trim();
      const numericVal = isBp ? parseFloat(vitalForm.bp_upper) : parseFloat(vitalForm.value);
      const res = await api.post("me/vitals", {
        vital_type: vitalForm.vital_type,
        value_text: valueText,
        value_numeric: Number.isFinite(numericVal) ? numericVal : undefined,
        unit: vitalInfo?.unit || undefined,
        notes: vitalForm.notes.trim() || undefined,
      }) as { points_earned?: number };
      toast({ title: "Vital recorded" });
      showPointsEarned(res, toast);
      setShowVitalModal(false);
      setVitalForm({ vital_type: "heart_rate", value: "", bp_upper: "", bp_lower: "", notes: "" });
    } catch (e) {
      toast({ title: "Failed to log vital", description: (e as Error).message, variant: "destructive" });
    }
    setSavingVital(false);
  };

  const handleLogMeal = async () => {
    setSavingMeal(true);
    try {
      const resMeal = await api.post("me/food_logs", {
        meal_type: mealForm.meal_type,
        notes: mealForm.notes.trim() || undefined,
        food_items: mealForm.notes.trim() ? [{ name: mealForm.notes.trim() }] : undefined,
      }) as { points_earned?: number };
      toast({ title: "Meal logged" });
      showPointsEarned(resMeal, toast);
      setShowMealModal(false);
      setMealForm({ meal_type: "lunch", notes: "" });
    } catch (e) {
      toast({ title: "Failed to log meal", description: (e as Error).message, variant: "destructive" });
    }
    setSavingMeal(false);
  };

  const invalidateQuickLog = () => {
    queryClient.invalidateQueries({ queryKey: ["me", "quick-log", "last"] });
    queryClient.invalidateQueries({ queryKey: ["me", "rewards"] });
    queryClient.invalidateQueries({ queryKey: ["me", "gamification"] });
    queryClient.invalidateQueries({ queryKey: ["me", "vitals"] });
    queryClient.invalidateQueries({ queryKey: ["me", "overview"] });
  };

  const quickLogBp = async (valueText: string) => {
    setSavingQuick(true);
    try {
      const [upper, lower] = valueText.split("/").map((s) => s.trim());
      const num = upper ? parseFloat(upper) : NaN;
      const resBp = await api.post("me/vitals", {
        vital_type: "blood_pressure",
        value_text: valueText,
        value_numeric: Number.isFinite(num) ? num : undefined,
        unit: "mmHg",
        source: "quick_log",
      }) as { points_earned?: number };
      toast({ title: "BP logged" });
      showPointsEarned(resBp, toast);
      setShowQuickBp(false);
      setQuickBpShowPresets(false);
      invalidateQuickLog();
    } catch (e) {
      toast({ title: "Failed to log BP", description: (e as Error).message, variant: "destructive" });
    }
    setSavingQuick(false);
  };

  const quickLogSugar = async (valueText: string) => {
    setSavingQuick(true);
    try {
      const num = parseFloat(valueText);
      const resSugar = await api.post("me/vitals", {
        vital_type: "blood_sugar",
        value_text: valueText,
        value_numeric: Number.isFinite(num) ? num : undefined,
        unit: "mg/dL",
        source: "quick_log",
      }) as { points_earned?: number };
      toast({ title: "Blood sugar logged" });
      showPointsEarned(resSugar, toast);
      setShowQuickSugar(false);
      setQuickSugarShowPresets(false);
      invalidateQuickLog();
    } catch (e) {
      toast({ title: "Failed to log", description: (e as Error).message, variant: "destructive" });
    }
    setSavingQuick(false);
  };

  const openQuickFoodStep2 = (mealType: string) => {
    setQuickFoodMealType(mealType);
    setQuickFoodNotes("");
    setQuickFoodFile(null);
    setQuickFoodPreview(null);
    setQuickFoodStep(2);
  };

  const quickLogFood = async () => {
    if (!quickFoodMealType) return;
    setSavingQuick(true);
    try {
      let imagePath: string | undefined;
      if (quickFoodFile) {
        const formData = new FormData();
        formData.append("file", quickFoodFile);
        const res = await fetch(`${API_BASE}/me/meal-image-upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getStoredToken()}`, "X-Authorization": `Bearer ${getStoredToken()}` },
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        imagePath = data.path;
      }
      const resFood = await api.post("me/food_logs", {
        meal_type: quickFoodMealType,
        notes: quickFoodNotes.trim() || undefined,
        image_path: imagePath,
        food_items: quickFoodNotes.trim() ? [{ name: quickFoodNotes.trim() }] : undefined,
        source: "quick_log",
      }) as { points_earned?: number };
      toast({ title: "Meal logged" });
      showPointsEarned(resFood, toast);
      setShowQuickFood(false);
      setQuickFoodStep(1);
      setQuickFoodMealType("");
      setQuickFoodNotes("");
      setQuickFoodFile(null);
      setQuickFoodPreview(null);
      invalidateQuickLog();
    } catch (e) {
      toast({ title: "Failed to log meal", description: (e as Error).message, variant: "destructive" });
    }
    setSavingQuick(false);
  };

  const toggleMedCheck = (slot: string, med: string) => {
    setMedChecks((prev) => ({
      ...prev,
      [slot]: { ...prev[slot], [med]: !prev[slot]?.[med] },
    }));
  };

  const quickLogMedicationYes = async () => {
    setSavingQuick(true);
    try {
      const resMed = await api.post("me/medication-log", { taken: true, source: "quick_log" }) as { points_earned?: number };
      toast({ title: "Logged" });
      showPointsEarned(resMed, toast);
      setShowQuickMed(false);
      invalidateQuickLog();
    } catch (e) {
      toast({ title: "Failed", variant: "destructive" });
    } finally {
      setSavingQuick(false);
    }
  };

  const quickLogMedicationBulk = async () => {
    setSavingQuick(true);
    try {
      let resBulk: { points_earned?: number } | undefined;
      if (medications.length === 0) {
        resBulk = await api.post("me/medication-log", { taken: true, source: "quick_log" }) as { points_earned?: number };
      } else {
        const entries: { time_of_day: string; medication_name: string; taken: boolean }[] = [];
        TIME_SLOTS.forEach(({ id }) => {
          medications.forEach((med) => {
            entries.push({ time_of_day: id, medication_name: med, taken: !!medChecks[id]?.[med] });
          });
        });
        if (entries.some((e) => e.taken)) {
          resBulk = await api.post("me/medication-log/bulk", { entries: entries.filter((e) => e.taken) }) as { points_earned?: number };
        }
      }
      toast({ title: "Medication log saved" });
      showPointsEarned(resBulk, toast);
      setShowQuickMed(false);
      setMedChecks({ morning: {}, afternoon: {}, evening: {}, night: {} });
      invalidateQuickLog();
    } catch (e) {
      toast({ title: "Failed to save", description: (e as Error).message, variant: "destructive" });
    }
    setSavingQuick(false);
  };

  const hasMessages = messages.length > 0;

  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const isUsualBp = routine?.blood_pressure && routine.blood_pressure.hour_utc === utcHour;
  const isUsualSugar = routine?.blood_sugar && routine.blood_sugar.hour_utc === utcHour;
  const usualBpLocal = routine?.blood_pressure
    ? (() => {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), routine.blood_pressure!.hour_utc, routine.blood_pressure!.minute_utc));
        return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      })()
    : null;

  return (
    <div className="h-screen w-full flex-1 flex flex-col bg-background overflow-hidden min-h-[100dvh]">
      {/* Header: safe-area so logo/link/hamburger aren't cut in PWA */}
      <header className="safe-area-header flex items-center justify-between gap-1 sm:gap-2 flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-30 min-h-[3.5rem] px-4 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onOpenMenu}
            className="touch-target p-2 rounded-xl hover:bg-muted active:bg-muted transition-colors text-muted-foreground flex-shrink-0 touch-manipulation -ml-0.5"
            aria-label="Open menu"
          >
            <Menu className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0 pl-1">
            <div className="w-8 h-8 sm:w-7 sm:h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Heart className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-primary" />
            </div>
            <span className="font-heading font-bold text-foreground truncate text-sm sm:text-base">Mediimate AI</span>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 min-w-0 overflow-x-auto no-scrollbar">
          {gamification != null && gamification.streak_days > 0 && (
            <StreakBadge data={gamification} compact />
          )}
          {gamification != null && gamification.level_label && (
            <div className="hidden sm:block">
              <LevelBadge data={gamification} compact />
            </div>
          )}
          {rewards != null && (
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex-shrink-0">
              <Trophy className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="font-heading font-semibold text-foreground tabular-nums text-sm">{rewards.health_score}</span>
              <span className="text-muted-foreground text-xs hidden sm:inline">/100</span>
            </div>
          )}
        </div>
        <Link
          to="/patient/overview"
          className="touch-target min-w-[44px] inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 active:bg-muted transition-colors flex-shrink-0 whitespace-nowrap touch-manipulation"
          aria-label="Go to Dashboard"
        >
          Dashboard
        </Link>
      </header>

      {/* Chat Area - full height: scrollable content + fixed bottom input (ChatGPT-style) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {!hasMessages ? (
          /* Empty state: scrollable content (greeting, quick log, health score, today's progress) + fixed chat at bottom */
          <>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-5 sm:py-6 pwa-scroll min-h-0 pb-4">
              <div className="w-full max-w-2xl mx-auto space-y-6">
                {/* Greeting */}
                <div className="text-center">
                  <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-foreground tracking-tight">
                    {getGreeting()}{patientName?.split(" ")[0] ? `, ${patientName.split(" ")[0]}` : ""}
                  </h1>
                  <p className="text-sm text-muted-foreground mt-1">Log today&apos;s health and chat with your care team</p>
                </div>

                {/* Quick log: BP, Sugar, Food, Medication */}
                <div className="rounded-2xl bg-card border border-border/60 shadow-sm p-4 sm:p-5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 text-center">Quick log</p>
                  <QuickLogCards
                    patientName={patientName}
                    onLogBP={() => { setQuickBpShowPresets(false); setShowQuickBp(true); }}
                    onLogSugar={() => { setQuickSugarShowPresets(false); setShowQuickSugar(true); }}
                    onLogFood={() => setShowQuickFood(true)}
                    onLogMedication={() => setShowQuickMed(true)}
                    compact
                  />
                </div>

                {/* Today's progress - one line only (no health score card on dashboard) */}
                <TodayProgress data={rewards} compact />

                {/* Optional banners */}
                {(isUsualBp || isUsualSugar) && (
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {isUsualBp && usualBpLocal && <>It&apos;s your usual BP time ({usualBpLocal}).</>}
                      {isUsualBp && isUsualSugar && " "}
                      {isUsualSugar && "Usual blood sugar logging time."}
                    </p>
                    <div className="flex gap-2 mt-2">
                      {isUsualBp && (
                        <button type="button" onClick={() => { setQuickBpShowPresets(false); setShowQuickBp(true); }} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium touch-manipulation">
                          Log BP
                        </button>
                      )}
                      {isUsualSugar && (
                        <button type="button" onClick={() => { setQuickSugarShowPresets(false); setShowQuickSugar(true); }} className="px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium touch-manipulation">
                          Log Sugar
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {!subscribed && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => subscribe()}
                      disabled={pushLoading}
                      className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-border bg-card text-sm text-muted-foreground hover:bg-muted hover:text-foreground touch-manipulation"
                    >
                      <Bell className="w-4 h-4 flex-shrink-0" />
                      {pushLoading ? "Enabling..." : "Enable reminders"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Chat section: no fixed line; big headline + input + buttons unified */}
            <div className="flex-shrink-0 bg-background pwa-input-bottom pwa-safe-x px-4 py-4">
              <div className="max-w-2xl mx-auto space-y-4">
                {/* Big headline - full width, part of chat section */}
                <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-foreground text-center w-full">
                  How are you feeling today{patientName ? `, ${patientName.split(" ")[0]}` : ""}?
                </h2>
                {/* Voice mode indicator */}
                {voiceInput.isListening && (
                  <div className="flex items-center justify-center gap-2 text-sm text-red-500 animate-pulse">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    Listening... {voiceInput.interimTranscript && <span className="text-muted-foreground italic truncate max-w-[200px]">{voiceInput.interimTranscript}</span>}
                  </div>
                )}
                {voiceOutput.isSpeaking && (
                  <div className="flex items-center justify-center gap-2 text-sm text-primary">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                    Speaking...
                  </div>
                )}
                {/* Single large input + send + mic */}
                <div className="relative rounded-2xl border border-border bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
                  <textarea
                    ref={textareaRef}
                    value={voiceInput.isListening ? (voiceInput.transcript || voiceInput.interimTranscript || "") : input}
                    onChange={(e) => {
                      if (!voiceInput.isListening) {
                        setInput(e.target.value);
                        autoResize();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder={voiceInput.isListening ? "Listening..." : "Ask anything about your symptoms, treatment or health"}
                    rows={1}
                    className="w-full resize-none bg-transparent pl-4 pr-24 py-4 text-base text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-h-[56px]"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {voiceInput.supported && (
                      <button
                        type="button"
                        onClick={() => {
                          unlockTTSAudio();
                          if (voiceInput.isListening) {
                            voiceInput.stopListening();
                          } else {
                            voiceOutput.stop();
                            setVoiceMode(true);
                            voiceInput.startListening();
                          }
                        }}
                        className={`w-10 h-10 min-h-[40px] rounded-xl flex items-center justify-center transition-all touch-manipulation ${
                          voiceInput.isListening
                            ? "bg-red-500 text-white animate-pulse"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                        aria-label={voiceInput.isListening ? "Stop listening" : "Voice input"}
                      >
                        {voiceInput.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => send()}
                      disabled={!input.trim() || isLoading}
                      className="w-10 h-10 min-h-[40px] rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity touch-manipulation"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Row 1: My medications, Next appointment, Labs, Vitals, Conditions, + Log a vital (green) */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { label: "My medications", query: "What medications am I currently taking?" },
                    { label: "Next appointment", query: "When is my next appointment?" },
                    { label: "Latest lab results", query: "Show me my latest lab results" },
                    { label: "My vitals", query: "How are my recent vitals looking?" },
                    { label: "My conditions", query: "What conditions do I have on record?" },
                  ].map((chip) => (
                    <button
                      key={chip.label}
                      onClick={() => send(chip.query)}
                      className="px-4 py-2.5 rounded-xl text-sm border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors touch-manipulation"
                    >
                      {chip.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowVitalModal(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors touch-manipulation"
                  >
                    + Log a vital
                  </button>
                </div>

                {/* Row 2: + Log my meal (green) */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowMealModal(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors touch-manipulation"
                  >
                    + Log my meal
                  </button>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-center gap-1.5 pt-1 text-[10px] sm:text-xs text-muted-foreground/60">
                  <Shield className="w-3 h-3 flex-shrink-0" />
                  <span>HIPAA Compliant · Encrypted & Private</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Messages */
          <>
            <div className="flex-1 overflow-y-auto px-4 py-6 pwa-safe-x pb-[max(1.5rem,var(--sab))]">
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Back to main view button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setMessages([]); conversationIdRef.current = null; }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors touch-manipulation"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Back to Home
                  </button>
                </div>
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Quick actions when in chat - Log vital / Log meal */}
            <div className="flex flex-wrap justify-center gap-2 px-4 pb-2">
              <button
                onClick={() => setShowVitalModal(true)}
                className="px-3 py-1.5 text-xs rounded-full border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              >
                ➕ Log a vital
              </button>
              <button
                onClick={() => setShowMealModal(true)}
                className="px-3 py-1.5 text-xs rounded-full border border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
              >
                ➕ Log my meal
              </button>
            </div>

            {/* Input at bottom when chatting */}
            <div className="flex-shrink-0 pt-2 border-t border-border/30 pwa-input-bottom pwa-safe-x px-4 sm:px-4">
              {(voiceInput.isListening || voiceOutput.isSpeaking) && (
                <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 text-xs pb-1">
                  {voiceInput.isListening && <span className="text-red-500 animate-pulse flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Listening...</span>}
                  {voiceOutput.isSpeaking && <span className="text-primary flex items-center gap-1"><Volume2 className="w-3 h-3 animate-pulse" /> Speaking...</span>}
                </div>
              )}
              <div className="max-w-3xl mx-auto relative border border-border rounded-2xl bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary/30 transition-shadow">
                <textarea
                  ref={textareaRef}
                  value={voiceInput.isListening ? (voiceInput.transcript || voiceInput.interimTranscript || "") : input}
                  onChange={(e) => {
                    if (!voiceInput.isListening) {
                      setInput(e.target.value);
                      autoResize();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={voiceInput.isListening ? "Listening..." : "Ask anything about your symptoms, treatment or health"}
                  rows={1}
                  className="w-full resize-none bg-transparent pl-4 pr-24 py-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                />
                <div className="absolute right-2 bottom-2 flex items-center gap-1">
                  {voiceInput.supported && (
                    <button
                      type="button"
                      onClick={() => {
                        unlockTTSAudio();
                        if (voiceInput.isListening) {
                          voiceInput.stopListening();
                        } else {
                          voiceOutput.stop();
                          setVoiceMode(true);
                          voiceInput.startListening();
                        }
                      }}
                      className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center transition-all touch-manipulation ${
                        voiceInput.isListening
                          ? "bg-red-500 text-white animate-pulse"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                      aria-label={voiceInput.isListening ? "Stop listening" : "Voice input"}
                    >
                      {voiceInput.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl bg-primary/80 hover:bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30 transition-all touch-manipulation"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Log vital modal */}
      <Dialog open={showVitalModal} onOpenChange={setShowVitalModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log a vital</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Type</Label>
              <select
                value={vitalForm.vital_type}
                onChange={(e) => setVitalForm((f) => ({ ...f, vital_type: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              >
                {VITAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label} ({t.unit})</option>
                ))}
              </select>
            </div>
            {vitalForm.vital_type === "blood_pressure" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Upper (Systolic) mmHg *</Label>
                  <Input
                    type="number"
                    min={60}
                    max={250}
                    placeholder="120"
                    value={vitalForm.bp_upper}
                    onChange={(e) => setVitalForm((f) => ({ ...f, bp_upper: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Lower (Diastolic) mmHg *</Label>
                  <Input
                    type="number"
                    min={40}
                    max={150}
                    placeholder="80"
                    value={vitalForm.bp_lower}
                    onChange={(e) => setVitalForm((f) => ({ ...f, bp_lower: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label>Value *</Label>
                <Input
                  type="text"
                  placeholder="e.g. 72"
                  value={vitalForm.value}
                  onChange={(e) => setVitalForm((f) => ({ ...f, value: e.target.value }))}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any context"
                value={vitalForm.notes}
                onChange={(e) => setVitalForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowVitalModal(false)} className="min-h-[44px] touch-manipulation">Cancel</Button>
            <Button
              onClick={handleLogVital}
              disabled={
                savingVital ||
                (vitalForm.vital_type === "blood_pressure"
                  ? !vitalForm.bp_upper.trim() || !vitalForm.bp_lower.trim()
                  : !vitalForm.value.trim())
              }
              className="min-h-[44px] touch-manipulation"
            >
              {savingVital ? "Saving..." : "Save vital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log meal modal */}
      <Dialog open={showMealModal} onOpenChange={setShowMealModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log my meal</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Meal type</Label>
              <select
                value={mealForm.meal_type}
                onChange={(e) => setMealForm((f) => ({ ...f, meal_type: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground"
              >
                {MEAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>What did you eat? (optional)</Label>
              <Textarea
                placeholder="e.g. Rice, dal, vegetables"
                value={mealForm.notes}
                onChange={(e) => setMealForm((f) => ({ ...f, notes: e.target.value }))}
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowMealModal(false)} className="min-h-[44px] touch-manipulation">Cancel</Button>
            <Button onClick={handleLogMeal} disabled={savingMeal} className="min-h-[44px] touch-manipulation">
              {savingMeal ? "Saving..." : "Log meal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Log BP */}
      <Dialog open={showQuickBp} onOpenChange={(open) => { setShowQuickBp(open); if (!open) setQuickBpShowPresets(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log BP</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {quickLogLast?.blood_pressure?.value_text && !quickBpShowPresets ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Last BP: <span className="font-semibold text-foreground">{quickLogLast.blood_pressure.value_text}</span></p>
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={() => quickLogBp(quickLogLast.blood_pressure!.value_text)} disabled={savingQuick}>
                    {savingQuick ? "Saving..." : "Yes, log again"}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setQuickBpShowPresets(true)}>Edit</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">Select BP</p>
                <div className="grid grid-cols-2 gap-2">
                  {BP_PRESETS.map((preset) => (
                    <Button key={preset} variant="outline" className="min-h-[44px] font-mono text-base sm:text-lg touch-manipulation" onClick={() => quickLogBp(preset)} disabled={savingQuick}>
                      {preset}
                    </Button>
                  ))}
                </div>
                <Button variant="secondary" className="w-full mt-2 min-h-[44px] touch-manipulation" onClick={() => { setShowQuickBp(false); setVitalForm((f) => ({ ...f, vital_type: "blood_pressure", bp_upper: "", bp_lower: "" })); setShowVitalModal(true); }}>
                  Enter custom
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Log Sugar */}
      <Dialog open={showQuickSugar} onOpenChange={(open) => { setShowQuickSugar(open); if (!open) setQuickSugarShowPresets(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Log Blood Sugar</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {quickLogLast?.blood_sugar?.value_text && !quickSugarShowPresets ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Last: <span className="font-semibold text-foreground">{quickLogLast.blood_sugar.value_text} mg/dL</span></p>
                <div className="flex gap-3">
                  <Button className="flex-1" onClick={() => quickLogSugar(quickLogLast.blood_sugar!.value_text)} disabled={savingQuick}>
                    {savingQuick ? "Saving..." : "Yes, log again"}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setQuickSugarShowPresets(true)}>Edit</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">Select value (mg/dL)</p>
                <div className="grid grid-cols-2 gap-2">
                  {SUGAR_PRESETS.map((n) => (
                    <Button key={n} variant="outline" className="h-12 font-mono text-lg" onClick={() => quickLogSugar(String(n))} disabled={savingQuick}>
                      {n}
                    </Button>
                  ))}
                </div>
                <Button variant="secondary" className="w-full mt-2 min-h-[44px] touch-manipulation" onClick={() => { setShowQuickSugar(false); setVitalForm((f) => ({ ...f, vital_type: "blood_sugar", value: "" })); setShowVitalModal(true); }}>
                  Enter custom
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Log Food - step 1: meal type, step 2: upload or describe */}
      <Dialog open={showQuickFood} onOpenChange={(open) => { setShowQuickFood(open); if (!open) setQuickFoodStep(1); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Food</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {quickFoodStep === 1 ? (
              <>
                <p className="text-xs text-muted-foreground mb-3">When did you eat?</p>
                <div className="grid grid-cols-2 gap-2">
                  {MEAL_OPTIONS.map(({ value, label }) => (
                    <Button key={value} variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => openQuickFoodStep2(value)}>
                      {label}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Button variant="ghost" size="sm" onClick={() => setQuickFoodStep(1)} className="p-0 h-auto">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium capitalize">{quickFoodMealType}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Upload a screenshot of your meal or describe what you ate</p>
                <label className="flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer mb-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        setQuickFoodFile(file);
                        const reader = new FileReader();
                        reader.onload = () => setQuickFoodPreview(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  {quickFoodPreview ? (
                    <img src={quickFoodPreview} alt="Meal" className="w-full h-full object-cover rounded-xl" />
                  ) : (
                    <>
                      <ImagePlus className="w-6 h-6 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Tap to upload photo</span>
                    </>
                  )}
                </label>
                <Label className="text-xs text-muted-foreground">What did you eat? (optional if you uploaded a photo)</Label>
                <Textarea
                  placeholder="e.g. Rice, dal, vegetables, chapati"
                  value={quickFoodNotes}
                  onChange={(e) => setQuickFoodNotes(e.target.value)}
                  className="mt-1 min-h-[72px] resize-none"
                />
                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setQuickFoodStep(1)} className="min-h-[44px] touch-manipulation">Back</Button>
                  <Button onClick={quickLogFood} disabled={savingQuick || (!quickFoodNotes.trim() && !quickFoodFile)} className="min-h-[44px] touch-manipulation">
                    {savingQuick ? "Saving..." : "Log meal"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Log Medication - list by time (maker-checker) or Yes/No if no meds */}
      <Dialog open={showQuickMed} onOpenChange={(open) => { setShowQuickMed(open); if (!open) setMedChecks({ morning: {}, afternoon: {}, evening: {}, night: {} }); }}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Medication taken</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {medications.length === 0 ? (
              <>
                <p className="text-sm text-muted-foreground mb-4">No medications on file. Did you take your medication today?</p>
                <div className="flex gap-3">
                  <Button className="flex-1 min-h-[44px] touch-manipulation" disabled={savingQuick} onClick={quickLogMedicationYes}>
                    {savingQuick ? "..." : "Yes"}
                  </Button>
                  <Button variant="outline" className="flex-1 min-h-[44px] touch-manipulation" onClick={() => setShowQuickMed(false)}>Cancel</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Add your medications via the Medications section in the menu to track them by name and time.</p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-3">Mark what you took for each time of day</p>
                <div className="space-y-4">
                  {TIME_SLOTS.map(({ id, label }) => (
                    <div key={id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
                      <div className="flex flex-wrap gap-2">
                        {medications.map((med) => (
                          <button
                            key={med}
                            type="button"
                            onClick={() => toggleMedCheck(id, med)}
                            className={`px-3 py-2 min-h-[44px] rounded-lg text-sm border transition-colors touch-manipulation ${
                              medChecks[id]?.[med] ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            {med}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter className="mt-4 gap-2 sm:gap-0">
                  <Button variant="outline" onClick={() => setShowQuickMed(false)} className="min-h-[44px] touch-manipulation">Cancel</Button>
                  <Button onClick={quickLogMedicationBulk} disabled={savingQuick} className="min-h-[44px] touch-manipulation">
                    {savingQuick ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Rewards Panel */}
      {showRewardsPanel && (
        <button type="button" className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" aria-label="Close rewards" onClick={() => setShowRewardsPanel(false)} />
      )}
      <div
        className={`fixed z-50 inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[400px] sm:max-w-[calc(100vw-2rem)] panel-slide ${
          showRewardsPanel ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] sm:max-h-[80vh] flex flex-col overflow-hidden bottom-sheet-safe">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-amber-50 to-primary/5 dark:from-amber-950/20 dark:to-primary/10 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Trophy className="w-4.5 h-4.5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-sm font-heading font-semibold text-foreground">Rewards & Progress</h3>
                <p className="text-xs text-muted-foreground">
                  {gamification?.total_points ?? 0} points earned
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowRewardsPanel(false)}
              className="p-2 rounded-lg hover:bg-muted transition-colors touch-manipulation"
              aria-label="Close rewards"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Streak & Level summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground">Streak</span>
                </div>
                <p className="text-lg font-heading font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {gamification?.streak_days ?? 0} <span className="text-xs font-normal text-muted-foreground">days</span>
                </p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Star className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Level</span>
                </div>
                <p className="text-sm font-heading font-semibold text-primary">{gamification?.level_label ?? "Beginner"}</p>
                <p className="text-xs text-muted-foreground">Level {gamification?.level ?? 1}</p>
              </div>
            </div>

            {/* Health Score */}
            {rewards && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">Today's Health Score</span>
                  </div>
                  <span className="text-lg font-heading font-bold text-primary tabular-nums">{rewards.health_score}<span className="text-xs font-normal text-muted-foreground">/100</span></span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${rewards.health_score}%` }} />
                </div>
              </div>
            )}

            {/* Today's Progress */}
            {rewards && (
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Today's logging</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: "bp", label: "BP", done: rewards.today_progress.bp, icon: Activity, color: "text-primary" },
                    { key: "food", label: "Food", done: rewards.today_progress.food, icon: UtensilsCrossed, color: "text-green-600" },
                    { key: "sugar", label: "Sugar", done: rewards.today_progress.sugar, icon: Droplets, color: "text-orange-500" },
                    { key: "medication", label: "Meds", done: rewards.today_progress.medication, icon: Pill, color: "text-violet-500" },
                  ].map(({ key, label, done, icon: Icon, color }) => (
                    <div
                      key={key}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-center ${
                        done ? "bg-primary/10" : "bg-muted/50"
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${done ? color : "text-muted-foreground"}`} />
                      <span className={`text-[10px] font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      <span className={`text-[10px] ${done ? "text-green-600 font-semibold" : "text-muted-foreground"}`}>
                        {done ? "Done" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Points breakdown */}
            {rewards && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Points breakdown</p>
                <div className="space-y-1.5">
                  {[
                    { label: "Blood Pressure", pts: rewards.points_breakdown.blood_pressure, icon: Activity, color: "bg-primary/60" },
                    { label: "Food", pts: rewards.points_breakdown.food, icon: UtensilsCrossed, color: "bg-green-500/60" },
                    { label: "Blood Sugar", pts: rewards.points_breakdown.blood_sugar, icon: Droplets, color: "bg-orange-500/60" },
                    { label: "Medication", pts: rewards.points_breakdown.medication, icon: Pill, color: "bg-violet-500/60" },
                  ].map(({ label, pts, icon: Icon, color }) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-foreground">{label}</span>
                      <span className="font-semibold tabular-nums text-foreground">{pts} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Milestone Rewards */}
            <MilestoneRewardsList data={gamification} />

            {/* Weekly Challenges */}
            <WeeklyChallengesList data={gamification} />

            {/* Badges */}
            <BadgesList data={gamification} />
          </div>
        </div>
      </div>

      {/* Floating Quick Log FAB + Rewards FAB */}
      {showQuickLogFab && (
        <button type="button" className="fixed inset-0 z-10" aria-label="Close menu" onClick={() => setShowQuickLogFab(false)} />
      )}
      <div className="fixed z-20 fab-position flex flex-col items-end gap-3">
        {/* Quick Log Popup */}
        {showQuickLogFab && (
          <div className="w-52 min-w-[12rem] rounded-xl border border-border bg-card shadow-lg py-2 mb-1">
            <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Quick Log</p>
            <button type="button" onClick={() => { setShowQuickLogFab(false); setShowQuickBp(true); setQuickBpShowPresets(false); }} className="w-full flex items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted touch-manipulation min-h-[44px]">
              <Activity className="w-4 h-4 text-primary flex-shrink-0" /> BP
            </button>
            <button type="button" onClick={() => { setShowQuickLogFab(false); setShowQuickSugar(true); setQuickSugarShowPresets(false); }} className="w-full flex items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted touch-manipulation min-h-[44px]">
              <Droplets className="w-4 h-4 text-accent flex-shrink-0" /> Sugar
            </button>
            <button type="button" onClick={() => { setShowQuickLogFab(false); setShowQuickFood(true); }} className="w-full flex items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted touch-manipulation min-h-[44px]">
              <UtensilsCrossed className="w-4 h-4 text-whatsapp flex-shrink-0" /> Food
            </button>
            <button type="button" onClick={() => { setShowQuickLogFab(false); setShowQuickMed(true); }} className="w-full flex items-center gap-2 px-3 py-3 text-left text-sm hover:bg-muted touch-manipulation min-h-[44px]">
              <Pill className="w-4 h-4 text-violet-500 flex-shrink-0" /> Medication
            </button>
          </div>
        )}
        {/* Rewards FAB */}
        <button
          type="button"
          onClick={() => { setShowRewardsPanel(true); setShowQuickLogFab(false); }}
          className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-lg flex items-center justify-center hover:from-amber-500 hover:to-amber-700 active:scale-95 transition-all touch-manipulation relative"
          aria-label="View rewards"
        >
          <Gift className="w-5 h-5" />
          {gamification && gamification.milestones?.some((m) => m.unlocked && !m.claimed) && (
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white animate-pulse" />
          )}
        </button>
        {/* Quick Log FAB */}
        <button
          type="button"
          onClick={() => setShowQuickLogFab((v) => !v)}
          className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all touch-manipulation"
          aria-label="Quick log"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default PatientChat;
