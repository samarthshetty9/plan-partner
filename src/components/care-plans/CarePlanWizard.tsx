import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles, ChevronRight, ChevronLeft, Check, Loader2,
  Plus, Trash2, Pencil, Zap, Trophy, Clock, X,
  Activity, Scale, Dumbbell, Heart, Scissors, Stethoscope,
  AlertCircle, FileText, ChevronDown, ChevronUp,
} from "lucide-react";
import DiabetesRequirementsForm, {
  DiabetesFormData,
  defaultDiabetesFormData,
} from "./DiabetesRequirementsForm";

// ─── Types ─────────────────────────────────────────────────────────────────

interface BuilderTask {
  id: string;
  title: string;
  description: string;
  type: "vital" | "medicine" | "action" | "education";
  points: number;
}

interface BuilderDay {
  day: number;
  theme: string;
  tasks: BuilderTask[];
}

interface Props {
  onDone: () => void;
  onCancel: () => void;
}

// ─── Medical categories ─────────────────────────────────────────────────────

type CategoryId = "diabetes" | "weight_loss" | "ortho" | "cardio" | "hair" | "custom";

const CATEGORIES: {
  id: CategoryId;
  label: string;
  icon: React.FC<{ className?: string }>;
  hasForm: boolean;
}[] = [
  { id: "diabetes",    label: "Diabetic Care",      icon: Activity,    hasForm: true  },
  { id: "weight_loss", label: "Weight Management",   icon: Scale,       hasForm: false },
  { id: "ortho",       label: "Ortho & Physio",      icon: Dumbbell,    hasForm: false },
  { id: "cardio",      label: "Cardiac Care",        icon: Heart,       hasForm: false },
  { id: "hair",        label: "Hair & Scalp",        icon: Scissors,    hasForm: false },
  { id: "custom",      label: "Custom / Other",      icon: Stethoscope, hasForm: false },
];

const TASK_COLORS: Record<string, string> = {
  vital:     "bg-blue-400",
  medicine:  "bg-rose-400",
  action:    "bg-emerald-400",
  education: "bg-amber-400",
};

const TASK_TYPES: BuilderTask["type"][] = ["vital", "medicine", "action", "education"];

// ─── Editable Day Card (same as before) ────────────────────────────────────

function EditableDayCard({
  dayData, onUpdate,
}: {
  dayData: BuilderDay;
  onUpdate: (updated: BuilderDay) => void;
}) {
  const [editing, setEditing] = useState(false);

  const updateTask = (idx: number, field: keyof BuilderTask, val: string | number) =>
    onUpdate({ ...dayData, tasks: dayData.tasks.map((t, i) => i === idx ? { ...t, [field]: val } : t) });

  const removeTask = (idx: number) =>
    onUpdate({ ...dayData, tasks: dayData.tasks.filter((_, i) => i !== idx) });

  const addTask = () =>
    onUpdate({
      ...dayData,
      tasks: [...dayData.tasks, {
        id: `d${dayData.day}-t${Date.now()}`,
        title: "New Task",
        description: "Describe what the patient should do.",
        type: "action",
        points: 10,
      }],
    });

  const totalPts = dayData.tasks.reduce((s, t) => s + (t.points || 0), 0);

  if (!editing) {
    return (
      <div className="group relative bg-white rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-lg transition-all overflow-hidden">
        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 bg-white border border-slate-200 shadow-sm px-2 py-1 rounded-full text-xs font-bold text-slate-600 hover:text-emerald-700 hover:border-emerald-300"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-slate-50 bg-slate-50/30">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              DAY {dayData.day}
            </span>
          </div>
          <p className="text-sm font-black text-slate-800 mt-1.5 line-clamp-1">{dayData.theme}</p>
        </div>
        <div className="p-5 space-y-3">
          {dayData.tasks.map((task, idx) => (
            <div key={idx} className="flex items-start gap-2 text-xs">
              <div className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${TASK_COLORS[task.type] || "bg-slate-400"}`} />
              <div>
                <p className="font-bold text-slate-700 leading-none mb-0.5">{task.title}</p>
                <p className="text-slate-500 leading-tight">{task.description}</p>
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-slate-50 flex items-center gap-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-bold text-slate-400">+{totalPts} MHP</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border-2 border-emerald-300 shadow-lg overflow-hidden">
      <div className="px-5 pt-4 pb-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800">
          DAY {dayData.day} — EDITING
        </span>
        <button onClick={() => setEditing(false)} className="text-emerald-700 hover:text-emerald-900">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Day Theme</p>
          <Input
            value={dayData.theme}
            onChange={e => onUpdate({ ...dayData, theme: e.target.value })}
            className="text-sm font-semibold"
          />
        </div>
        <div className="space-y-3">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tasks</p>
          {dayData.tasks.map((task, idx) => (
            <div key={task.id} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-100">
              <div className="flex items-center gap-2">
                <Input value={task.title} onChange={e => updateTask(idx, "title", e.target.value)} className="text-xs font-semibold flex-1 h-8" />
                <select
                  value={task.type}
                  onChange={e => updateTask(idx, "type", e.target.value)}
                  className="text-xs border border-input rounded-md px-2 h-8 bg-background text-slate-600"
                >
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input
                  type="number"
                  value={task.points}
                  onChange={e => updateTask(idx, "points", Number(e.target.value))}
                  className="w-14 text-xs border border-input rounded-md px-2 h-8 bg-background text-center"
                  min={0}
                />
                <span className="text-[10px] text-slate-400 font-bold">pts</span>
                <button onClick={() => removeTask(idx)} className="text-red-400 hover:text-red-600 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Input value={task.description} onChange={e => updateTask(idx, "description", e.target.value)} className="text-xs h-8" placeholder="Brief patient instruction" />
            </div>
          ))}
          <button
            onClick={addTask}
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-bold border border-dashed border-emerald-300 rounded-xl px-3 py-2 w-full justify-center hover:bg-emerald-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add Task
          </button>
        </div>
        <button onClick={() => setEditing(false)} className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl">
          Done Editing
        </button>
      </div>
    </div>
  );
}

// ─── Main Wizard ─────────────────────────────────────────────────────────────

export default function CarePlanWizard({ onDone, onCancel }: Props) {
  const { toast } = useToast();

  // Step 1 state
  const [planName, setPlanName]       = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]       = useState<CategoryId | null>(null);
  const [durationDays, setDurationDays] = useState<30 | 60 | 90>(30);
  const [formOpen, setFormOpen]       = useState(false);
  const [diabetesForm, setDiabetesForm] = useState<DiabetesFormData>(defaultDiabetesFormData());

  // Step 2 state
  const [step, setStep]               = useState<1 | 2>(1);
  const [generating, setGenerating]   = useState(false);
  const [generatedDays, setGeneratedDays] = useState<BuilderDay[]>([]);
  const [generatedName, setGeneratedName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [coverColor, setCoverColor]   = useState("#16a34a");
  const [saving, setSaving]           = useState(false);

  const selectedCat = CATEGORIES.find(c => c.id === category);

  function handleFormButtonClick() {
    if (!category) return;
    const cat = CATEGORIES.find(c => c.id === category);
    if (cat?.hasForm) {
      setFormOpen(v => !v);
    } else {
      toast({
        title: "Requirements form not yet available",
        description: `A requirements form for "${cat?.label}" has not been created yet. Only Diabetic Care has a requirements form at this time.`,
      });
    }
  }

  async function handleGenerate() {
    if (!planName.trim() || !category) return;
    setGenerating(true);
    try {
      const clinical_params =
        category === "diabetes" ? diabetesForm : {};
      const data = await api.post<{
        name: string; description: string; cover_color: string; days: BuilderDay[];
      }>("/care-plans/wizard-generate", {
        category,
        duration_days: durationDays,
        clinical_params,
        plan_name: planName.trim(),
      });
      setGeneratedDays(data.days || []);
      setPlanDescription(data.description || "");
      setCoverColor(data.cover_color || "#16a34a");
      setGeneratedName(data.name || planName.trim());
      setStep(2);
    } catch (err: any) {
      toast({ title: "Generation failed", description: err?.message || "Unknown error — check server logs.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.post("/care-plans/create", {
        name: generatedName || planName,
        condition: category?.replace("_", " ") || "custom",
        duration_days: durationDays,
        description: planDescription,
        cover_color: coverColor,
        days: generatedDays,
        scoring_rules: {},
        reward_tiers: [],
        week_themes: [],
      });
      toast({ title: "Care plan saved!" });
      onDone();
    } catch {
      toast({ title: "Failed to save care plan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  // ── Step 1 ─────────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="max-w-3xl space-y-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-800">New Care Plan</h2>
            <p className="text-sm text-slate-500 mt-0.5">Fill in the details below, then generate with Gemini AI.</p>
          </div>
          <button onClick={onCancel} className="text-sm text-slate-400 hover:text-slate-600 font-medium">Cancel</button>
        </div>

        {/* Basic info */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Care Plan Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={planName}
              onChange={e => setPlanName(e.target.value)}
              placeholder="e.g. 30-Day Diabetic Reversal Programme"
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Brief overview of what this programme achieves and who it's for…"
              className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Duration</label>
            <div className="flex gap-2">
              {([30, 60, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDurationDays(d)}
                  className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${
                    durationDays === d
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {d} days
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Medical category */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-0.5">
              Medical Category <span className="text-red-500">*</span>
            </p>
            <p className="text-xs text-slate-500">Select the type of care plan — this shapes the AI's clinical recommendations.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const active = category === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => { setCategory(cat.id); setFormOpen(false); }}
                  className={`text-left p-4 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    active
                      ? "border-emerald-400 bg-emerald-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                  <span className={`text-sm font-bold ${active ? "text-emerald-800" : "text-slate-700"}`}>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Requirements form section */}
        {category && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Clinical Requirements{" "}
                  <span className="text-slate-400 font-normal text-xs ml-1">(optional — shapes AI generation)</span>
                </p>
              </div>
            </div>

            {selectedCat?.hasForm ? (
              <div className="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                {/* Toggle header */}
                <button
                  onClick={() => setFormOpen(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-emerald-600" />
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">Diabetic Care Requirements Form</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Fill out the clinical requirements for this plan — monitoring, lab tests, nutrition, activity and more.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {formOpen
                      ? <><span className="text-xs font-bold text-emerald-700">Close form</span><ChevronUp className="w-4 h-4 text-emerald-700" /></>
                      : <><span className="text-xs font-bold text-emerald-600">Open form</span><ChevronDown className="w-4 h-4 text-emerald-600" /></>
                    }
                  </div>
                </button>

                {/* Form body */}
                {formOpen && (
                  <div className="px-6 pb-6 pt-2 border-t border-slate-100">
                    <DiabetesRequirementsForm data={diabetesForm} onChange={setDiabetesForm} />
                    <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() => setFormOpen(false)}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl text-sm transition-colors"
                      >
                        <Check className="w-4 h-4" /> Done — Save Requirements
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Requirements form not yet available for {selectedCat?.label}</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Only the Diabetic Care requirements form has been created at this time. A requirements form for{" "}
                    {selectedCat?.label} will be added in a future update. You can still generate a plan — Gemini will use
                    standard clinical guidelines for this category.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <button
            onClick={handleGenerate}
            disabled={!planName.trim() || !category || generating}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors shadow-sm shadow-emerald-100"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate with Gemini <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Generated plan ─────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-6 pb-20">
      {/* Plan header strip */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
        <div className="h-2 w-full" style={{ background: coverColor }} />
        <div className="p-5 flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 space-y-1">
            <input
              value={generatedName || planName}
              onChange={e => setGeneratedName(e.target.value)}
              className="text-xl font-black text-slate-800 bg-transparent border-none outline-none w-full focus:ring-0 p-0"
            />
            {planDescription && (
              <input
                value={planDescription}
                onChange={e => setPlanDescription(e.target.value)}
                className="text-sm text-slate-500 bg-transparent border-none outline-none w-full focus:ring-0 p-0"
              />
            )}
            <div className="flex gap-3 pt-1">
              <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 text-[10px] font-black capitalize">
                {selectedCat?.label}
              </Badge>
              <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
                <Clock className="w-3 h-3" /> {durationDays} days
              </span>
              {generatedDays.length > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  {generatedDays.reduce((s, d) => s + d.tasks.reduce((ts, t) => ts + (t.points || 0), 0), 0)} total MHP
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-1.5 text-xs border border-slate-200 px-3 py-2 rounded-xl text-slate-600 hover:border-slate-400 font-bold"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Back
            </button>
            <button
              onClick={handleSave}
              disabled={generatedDays.length === 0 || saving}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4" /> Save Care Plan</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Day grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-600">{generatedDays.length} days generated — hover any card to edit</p>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs border border-slate-200 px-3 py-1.5 rounded-full text-slate-600 hover:border-emerald-300 hover:text-emerald-700 font-bold transition-colors disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Regenerate
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {generatedDays.map((day, idx) => (
            <EditableDayCard
              key={day.day}
              dayData={day}
              onUpdate={updated => setGeneratedDays(prev => prev.map((d, i) => i === idx ? updated : d))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
