import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Plus, X, UserPlus, TrendingUp, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQueryClient } from "@tanstack/react-query";

interface Enrollment {
  id: string;
  patient_id: string;
  program_id: string;
  status: string;
  adherence_pct: number | null;
  enrolled_at: string;
  completed_at: string | null;
  patient_name?: string;
  program_name?: string;
  program_type?: string;
}

interface Patient {
  id: string;
  full_name: string;
}

interface Program {
  id: string;
  name: string;
  type: string;
}

const statusColors: Record<string, string> = {
  active: "bg-whatsapp/10 text-whatsapp",
  completed: "bg-primary/10 text-primary",
  paused: "bg-muted text-muted-foreground",
  dropped: "bg-destructive/10 text-destructive",
};

const Enrollments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patient_id: "", program_id: "" });
  const [saving, setSaving] = useState(false);
  const [editingAdherence, setEditingAdherence] = useState<string | null>(null);
  const [adherenceValue, setAdherenceValue] = useState("");

  const fetchData = async () => {
    if (!user) return;
    try {
      const [enrollRes, patientResRaw, programRes] = await Promise.all([
        api.get<Enrollment[]>("enrollments"),
        api.get<{ items: Patient[] }>("patients", { limit: "200", skip: "0" }),
        api.get<Program[]>("doctor/programs"),
      ]);
      const patientRes = patientResRaw?.items ?? [];
      const patientMap: Record<string, string> = {};
      const programMap: Record<string, { name: string; type: string }> = {};
      patientRes.forEach((p) => { patientMap[p.id] = p.full_name; });
      (programRes || []).forEach((p) => { programMap[p.id] = { name: p.name, type: p.type }; });
      setPatients(patientRes);
      setPrograms(programRes || []);
      setEnrollments(
        (enrollRes || []).map((e) => ({
          ...e,
          adherence_pct: e.adherence_pct ? Number(e.adherence_pct) : null,
          patient_name: patientMap[e.patient_id] || "Unknown",
          program_name: programMap[e.program_id]?.name || "Unknown",
          program_type: programMap[e.program_id]?.type || "",
        }))
      );
    } catch {
      setEnrollments([]);
      setPatients([]);
      setPrograms([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await api.post("enrollments", { patient_id: form.patient_id, program_id: form.program_id });
      toast({ title: "Patient enrolled successfully" });
      setShowForm(false);
      setForm({ patient_id: "", program_id: "" });
      fetchData();
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: Record<string, unknown> = { status };
    if (status === "completed") (updates as any).completed_at = new Date().toISOString();
    try {
      await api.patch("enrollments/" + id, updates);
      fetchData();
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const updateAdherence = async (id: string) => {
    const val = parseFloat(adherenceValue);
    if (isNaN(val) || val < 0 || val > 100) {
      toast({ title: "Invalid value", description: "Enter a number between 0 and 100", variant: "destructive" });
      return;
    }
    try {
      await api.patch("enrollments/" + id, { adherence_pct: val });
      setEditingAdherence(null);
      setAdherenceValue("");
      fetchData();
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Enrollments</h1>
          <p className="text-muted-foreground text-sm">{enrollments.length} total enrollments</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Enroll Patient
        </button>
      </div>

      {/* Enroll Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Enroll Patient in Program</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            {patients.length === 0 || programs.length === 0 ? (
              <p className="text-sm text-muted-foreground">You need at least one patient and one active program to create an enrollment.</p>
            ) : (
              <form onSubmit={handleEnroll} className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Patient</label>
                  <select required value={form.patient_id} onChange={(e) => setForm({ ...form, patient_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">Select patient...</option>
                    {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Program</label>
                  <select required value={form.program_id} onChange={(e) => setForm({ ...form, program_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                    <option value="">Select program...</option>
                    {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <button type="submit" disabled={saving} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                  {saving ? "Enrolling..." : "Enroll Patient"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Enrollments Table */}
      {enrollments.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
          <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No enrollments yet. Enroll a patient in a program to start tracking adherence.
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Program</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Enrolled</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-default">
                            Adherence <Info className="w-3 h-3 opacity-50" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Percentage of daily programme tasks completed by the patient.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-default">
                            Status <Info className="w-3 h-3 opacity-50" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <strong>active</strong> — currently enrolled · <strong>completed</strong> — finished programme · <strong>paused</strong> — temporarily stopped · <strong>dropped</strong> — withdrawn
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-default">
                            Actions <Info className="w-3 h-3 opacity-50" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          Update the enrolment status. Click the adherence percentage directly in that column to edit it manually.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{e.patient_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{e.program_name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {new Date(e.enrolled_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {editingAdherence === e.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={adherenceValue}
                            onChange={(ev) => setAdherenceValue(ev.target.value)}
                            className="w-16 px-2 py-1 rounded border border-border bg-background text-foreground text-xs"
                            autoFocus
                            onKeyDown={(ev) => { if (ev.key === "Enter") updateAdherence(e.id); if (ev.key === "Escape") setEditingAdherence(null); }}
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingAdherence(e.id); setAdherenceValue(String(e.adherence_pct ?? 0)); }}
                          className="inline-flex items-center gap-1 text-xs hover:bg-muted px-2 py-1 rounded transition-colors"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span className={`font-medium ${(e.adherence_pct ?? 0) >= 80 ? "text-whatsapp" : (e.adherence_pct ?? 0) >= 50 ? "text-primary" : "text-destructive"}`}>
                            {e.adherence_pct ?? 0}%
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[e.status] || ""}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={e.status}
                        onChange={(ev) => updateStatus(e.id, ev.target.value)}
                        className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground"
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="dropped">Dropped</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Enrollments;
