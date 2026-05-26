import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { UtensilsCrossed, Flame, Beef, Wheat, Droplets, Send, Loader2 } from "lucide-react";
import { NutritionInsights } from "@/components/NutritionInsights";
import { computeNutritionInsights } from "@/lib/nutritionAnalysis";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface FoodLog {
  id: string;
  meal_type: string;
  food_items: any[];
  raw_message: string | null;
  total_calories: number | null;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  notes: string | null;
  source: string;
  logged_at: string;
}

interface Props {
  patientId: string;
  doctorId: string;
  onLogAdded?: () => void;
}

const mealColors: Record<string, string> = {
  breakfast: "hsl(var(--primary))",
  lunch: "hsl(var(--accent))",
  dinner: "hsl(var(--destructive))",
  snack: "hsl(var(--muted-foreground))",
  other: "hsl(var(--secondary-foreground))",
};

const mealEmoji: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍪",
  other: "🍽️",
};

const PatientFoodTab = ({ patientId, doctorId, onLogAdded }: Props) => {
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [parsing, setParsing] = useState(false);

  const fetchLogs = async () => {
    try {
      const data = await api.get<FoodLog[]>("food_logs", { patient_id: patientId });
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [patientId, doctorId]);

  const handleParseFood = async () => {
    if (!message.trim()) return;
    setParsing(true);
    try {
      await api.post("food_logs", {
        patient_id: patientId,
        meal_type: "other",
        raw_message: message.trim(),
        source: "manual",
      });
      toast.success("Food log added!");
      setMessage("");
      fetchLogs();
      onLogAdded?.();
    } catch {
      toast.error("Failed to add food log");
    }
    setParsing(false);
  };

  const nutritionInsights = useMemo(() => computeNutritionInsights(logs), [logs]);

  // Analytics
  const todayLogs = logs.filter(l => format(new Date(l.logged_at), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"));
  const todayCalories = todayLogs.reduce((s, l) => s + (l.total_calories || 0), 0);
  const todayProtein = todayLogs.reduce((s, l) => s + (l.total_protein || 0), 0);
  const todayCarbs = todayLogs.reduce((s, l) => s + (l.total_carbs || 0), 0);
  const todayFat = todayLogs.reduce((s, l) => s + (l.total_fat || 0), 0);

  // Daily calorie trend (last 7 days)
  const dailyCalories: Record<string, number> = {};
  logs.forEach(l => {
    const day = format(new Date(l.logged_at), "MMM d");
    dailyCalories[day] = (dailyCalories[day] || 0) + (l.total_calories || 0);
  });
  const calorieTrend = Object.entries(dailyCalories).slice(0, 7).reverse().map(([date, calories]) => ({ date, calories }));

  // Meal type distribution
  const mealDist: Record<string, number> = {};
  logs.forEach(l => { mealDist[l.meal_type] = (mealDist[l.meal_type] || 0) + 1; });
  const pieData = Object.entries(mealDist).map(([name, value]) => ({ name, value }));

  // Macro chart for today
  const macroData = [
    { name: "Protein", value: todayProtein, color: "hsl(var(--primary))" },
    { name: "Carbs", value: todayCarbs, color: "hsl(var(--accent))" },
    { name: "Fat", value: todayFat, color: "hsl(var(--destructive))" },
  ];

  // Group logs by date
  const groupedLogs = useMemo(() => {
    const groups: Record<string, { date: string, logs: FoodLog[], totalCalories: number, totalProtein: number, totalCarbs: number, totalFat: number }> = {};
    logs.forEach(log => {
      const dateKey = format(new Date(log.logged_at), "yyyy-MM-dd");
      if (!groups[dateKey]) {
        groups[dateKey] = {
          date: dateKey,
          logs: [],
          totalCalories: 0,
          totalProtein: 0,
          totalCarbs: 0,
          totalFat: 0,
        };
      }
      groups[dateKey].logs.push(log);
      groups[dateKey].totalCalories += (log.total_calories || 0);
      groups[dateKey].totalProtein += (log.total_protein || 0);
      groups[dateKey].totalCarbs += (log.total_carbs || 0);
      groups[dateKey].totalFat += (log.total_fat || 0);
    });
    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [logs]);

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      {/* AI Nutrition Insights */}
      <div className="glass-card rounded-xl p-5">
        <NutritionInsights data={nutritionInsights} />
      </div>

      {/* WhatsApp-style food logger */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-primary" /> Log Food (WhatsApp Style)
        </h3>
        <p className="text-xs text-muted-foreground">
          Type what the patient ate, as they'd message on WhatsApp. AI will parse nutrition automatically.
        </p>
        <div className="flex gap-2">
          <Textarea
            placeholder="e.g. 'Had 2 roti, dal, and rice for lunch with buttermilk'"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[60px] flex-1"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleParseFood(); } }}
          />
          <Button onClick={handleParseFood} disabled={parsing || !message.trim()} size="icon" className="self-end h-10 w-10">
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-3 text-center">
          <Flame className="w-4 h-4 text-destructive mx-auto mb-1" />
          <p className="text-lg font-heading font-bold text-foreground">{todayCalories}</p>
          <p className="text-[10px] text-muted-foreground">Calories Today</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <Beef className="w-4 h-4 text-primary mx-auto mb-1" />
          <p className="text-lg font-heading font-bold text-foreground">{todayProtein}g</p>
          <p className="text-[10px] text-muted-foreground">Protein</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <Wheat className="w-4 h-4 text-accent mx-auto mb-1" />
          <p className="text-lg font-heading font-bold text-foreground">{todayCarbs}g</p>
          <p className="text-[10px] text-muted-foreground">Carbs</p>
        </div>
        <div className="glass-card rounded-xl p-3 text-center">
          <Droplets className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
          <p className="text-lg font-heading font-bold text-foreground">{todayFat}g</p>
          <p className="text-[10px] text-muted-foreground">Fat</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Calorie Trend */}
        {calorieTrend.length > 0 && (
          <div className="glass-card rounded-xl p-5 space-y-3">
            <h3 className="font-heading font-semibold text-foreground text-sm">Daily Calorie Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={calorieTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="calories" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Macro Breakdown Today */}
        {todayCalories > 0 && (
          <div className="glass-card rounded-xl p-5 space-y-3">
            <h3 className="font-heading font-semibold text-foreground text-sm">Today's Macros</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={macroData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} unit="g" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} width={60} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {macroData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Meal Distribution */}
        {pieData.length > 0 && (
          <div className="glass-card rounded-xl p-5 space-y-3">
            <h3 className="font-heading font-semibold text-foreground text-sm">Meal Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={mealColors[entry.name] || "hsl(var(--muted))"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Food Log History Grouped */}
      <div className="glass-card rounded-xl p-5 space-y-4">
        <h3 className="font-heading font-semibold text-foreground text-sm">Food Log History</h3>
        {groupedLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No food logs yet. Use the input above to log meals.</p>
        ) : (
          <div className="space-y-6">
            {groupedLogs.map((group) => (
              <div key={group.date} className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-border/50">
                  <h4 className="font-heading font-semibold text-foreground text-sm">
                    {format(new Date(group.date), "EEEE, MMM d, yyyy")}
                  </h4>
                  <div className="flex gap-3 text-[10px] sm:text-xs font-medium text-muted-foreground">
                    <span className="text-destructive">🔥 {group.totalCalories} cal</span>
                    <span className="text-primary">🥩 {group.totalProtein}g P</span>
                    <span className="text-accent">🌾 {group.totalCarbs}g C</span>
                    <span>💧 {group.totalFat}g F</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.logs.map((log) => (
                    <div key={log.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">
                          {mealEmoji[log.meal_type] || "🍽️"} {log.meal_type.charAt(0).toUpperCase() + log.meal_type.slice(1)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(log.logged_at), "HH:mm")}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {log.food_items?.map((item: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                            {item.quantity} {item.unit} {item.name}
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span>🔥 {log.total_calories || 0}</span>
                        <span>🥩 {log.total_protein || 0}</span>
                        <span>🌾 {log.total_carbs || 0}</span>
                        <span>💧 {log.total_fat || 0}</span>
                      </div>
                      {log.raw_message && (
                        <p className="text-xs text-muted-foreground italic mt-2">"{log.raw_message}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientFoodTab;
