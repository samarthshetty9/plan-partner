import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { NutritionInsights } from "@/components/NutritionInsights";
import { computeNutritionInsights } from "@/lib/nutritionAnalysis";
import type { NutritionInsightsData } from "@/components/NutritionInsights";
import { UtensilsCrossed, Pencil, Loader2, Flame, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FoodLog {
  id: string;
  meal_type: string;
  food_items?: { name?: string; quantity?: number; unit?: string; calories?: number }[] | null;
  notes?: string | null;
  total_calories?: number | null;
  total_protein?: number | null;
  total_carbs?: number | null;
  total_fat?: number | null;
  logged_at: string;
}

const MEAL_TYPES = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "other", label: "Other" },
];

const emptyInsights: NutritionInsightsData = {
  totalMeals: 0,
  avgCalories: 0,
  healthScore: 0,
  topFoods: [],
  overallAssessment: "No meals logged yet. Log meals from the AI Assistant page to see your nutrition insights here.",
  strengths: [],
  areasToImprove: [],
};

export default function PatientFoodAnalysis() {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Edit state
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null);
  const [editMealType, setEditMealType] = useState("lunch");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<FoodLog[]>("me/food_logs")
      .then((data) => {
        const fetched = Array.isArray(data) ? data : [];
        if (!cancelled) {
          setLogs(fetched);
          setLoading(false);
        }

        // Silently reassess any logs that have notes but no calorie data
        const stale = fetched.filter(
          (l) =>
            (l.total_calories == null || l.total_calories === 0) &&
            (l.notes || (Array.isArray(l.food_items) && l.food_items.length > 0)),
        );
        if (stale.length === 0) return;

        Promise.allSettled(
          stale.map((l) =>
            api.patch<FoodLog>(`me/food_logs/${l.id}`, {
              meal_type: l.meal_type,
              notes:
                l.notes ||
                (Array.isArray(l.food_items)
                  ? l.food_items.map((i) => i?.name).filter(Boolean).join(", ")
                  : ""),
            }),
          ),
        ).then((results) => {
          if (cancelled) return;
          setLogs((prev) => {
            const updated = [...prev];
            results.forEach((r, idx) => {
              if (r.status === "fulfilled") {
                const fresh = r.value;
                const pos = updated.findIndex((l) => l.id === stale[idx].id);
                if (pos !== -1) updated[pos] = { ...fresh, id: fresh.id || stale[idx].id };
              }
            });
            return updated;
          });
        });
      })
      .catch(() => {
        if (!cancelled) { setLogs([]); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, []);

  const recentLogs = useMemo(() => {
    const now = new Date();
    return logs.filter((log) => {
      const logDate = new Date(log.logged_at);
      const diffTime = now.getTime() - logDate.getTime();
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      return diffDays < 14; // Keep only logs within the last 14 days
    });
  }, [logs]);

  const isLatestTooOld = useMemo(() => {
    if (logs.length === 0) return false;
    const sorted = [...logs].sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
    const latestDate = new Date(sorted[0].logged_at);
    const now = new Date();
    const diffTime = now.getTime() - latestDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays >= 14;
  }, [logs]);

  const emptyInsightsWithStatus = useMemo(() => {
    return {
      totalMeals: 0,
      avgCalories: 0,
      healthScore: 0,
      topFoods: [],
      overallAssessment: isLatestTooOld
        ? "Your previous meal logs are weeks old and have been ignored to ensure accurate, up-to-date tracking. Please log fresh meals on the Chat page to see active insights."
        : "No meals logged recently. Log meals from the AI Assistant page to see your nutrition insights here.",
      strengths: [],
      areasToImprove: [],
    };
  }, [isLatestTooOld]);

  const insights = useMemo(
    () => (recentLogs.length ? computeNutritionInsights(recentLogs) : emptyInsightsWithStatus),
    [recentLogs, emptyInsightsWithStatus],
  );

  const openEdit = (log: FoodLog) => {
    setEditingLog(log);
    setEditMealType(log.meal_type || "other");
    setEditNotes(log.notes || (Array.isArray(log.food_items) ? log.food_items.map((i) => i?.name).filter(Boolean).join(", ") : "") || "");
  };

  const closeEdit = () => {
    setEditingLog(null);
    setEditNotes("");
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    setSaving(true);
    try {
      const updated = await api.patch<FoodLog>(`me/food_logs/${editingLog.id}`, {
        meal_type: editMealType,
        notes: editNotes.trim(),
      });
      setLogs((prev) => prev.map((l) => (l.id === editingLog.id ? { ...updated, id: updated.id || editingLog.id } : l)));
      toast({ title: "Meal updated", description: updated.total_calories ? `Recalculated: ${Math.round(updated.total_calories)} kcal` : "Meal updated successfully." });
      closeEdit();
    } catch (e) {
      toast({ title: "Failed to update meal", description: (e as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Food Analysis</h1>
        <p className="text-muted-foreground text-sm">AI-powered nutrition insights from your meal logs</p>
      </div>

      {isLatestTooOld && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
          <UtensilsCrossed className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Outdated Logs Ignored</p>
            <p className="text-muted-foreground mt-1">
              Your previous meal logs are weeks old and have been ignored to ensure accurate, up-to-date tracking. Please log fresh meals from the Chat or Overview page to see active insights.
            </p>
          </div>
        </div>
      )}

      <div className="glass-card rounded-xl p-5">
        <NutritionInsights data={insights} />
      </div>

      {/* Previous meal logs */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <UtensilsCrossed className="w-5 h-5 text-primary" />
          Previous meal logs
        </h2>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No meals logged yet. Log meals from the Overview page to see them here.</p>
        ) : (
          <div className="space-y-2 max-h-[40vh] sm:max-h-[320px] overflow-y-auto">
            {logs.map((log) => {
              const items = Array.isArray(log.food_items) ? log.food_items : [];
              const names = items.map((i) => i?.name).filter(Boolean).join(", ");
              const summary = names || log.notes || "—";
              const isEditing = editingLog?.id === log.id;
              return (
                <div key={log.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2">
                  {isEditing ? (
                    /* ── Edit inline form ── */
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <select
                          value={editMealType}
                          onChange={(e) => setEditMealType(e.target.value)}
                          className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-sm"
                        >
                          {MEAL_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {format(new Date(log.logged_at), "MMM d, yyyy 'at' HH:mm")}
                        </span>
                      </div>
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Describe what you ate (e.g. 2 roti, dal, rice)"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                      <p className="text-xs text-muted-foreground">AI will re-assess calories and nutrition after saving.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving || !editNotes.trim()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          {saving ? "Saving..." : "Save & Reassess"}
                        </button>
                        <button
                          onClick={closeEdit}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted"
                        >
                          <X className="w-3.5 h-3.5" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── Read-only row ── */
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-foreground capitalize">{log.meal_type || "Meal"}</p>
                        <p className="text-xs text-muted-foreground truncate" title={summary}>{summary}</p>
                        {log.total_calories != null && log.total_calories > 0 && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                            <Flame className="w-3 h-3" />
                            {Math.round(log.total_calories)} kcal
                            {log.total_protein != null && log.total_protein > 0 && ` · ${Math.round(log.total_protein)}g protein`}
                            {log.total_carbs != null && log.total_carbs > 0 && ` · ${Math.round(log.total_carbs)}g carbs`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "MMM d, yyyy 'at' HH:mm")}</p>
                        <button
                          onClick={() => openEdit(log)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Edit meal"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
