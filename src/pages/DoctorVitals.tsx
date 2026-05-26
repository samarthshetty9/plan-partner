import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Plus, X, Activity, Upload } from "lucide-react";
import { format } from "date-fns";

const VITAL_TYPES = [
  { value: "blood_pressure", label: "Blood Pressure", unit: "mmHg" },
  { value: "heart_rate", label: "Heart Rate", unit: "bpm" },
  { value: "temperature", label: "Temperature", unit: "°F" },
  { value: "weight", label: "Weight", unit: "kg" },
  { value: "blood_sugar", label: "Blood Sugar", unit: "mg/dL" },
  { value: "spo2", label: "SpO2", unit: "%" },
];

type BulkRow = { vital_type: string; value_text: string; value_numeric: string; notes: string };

const emptyBulkRow = (): BulkRow => ({ vital_type: "blood_pressure", value_text: "", value_numeric: "", notes: "" });

const DoctorVitals = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vitals, setVitals] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [form, setForm] = useState({ patient_id: "", vital_type: "blood_pressure", value_text: "", value_numeric: "", bp_systolic: "", bp_diastolic: "", notes: "" });
  const [bulkPatientId, setBulkPatientId] = useState("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
  const [saving, setSaving] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [vitalsList, patientsList] = await Promise.all([
        api.get<any[]>("vitals").catch(() => []),
        api.get<{ items: any[] }>("patients", { limit: "200", skip: "0" }).then((r) => r.items ?? []).catch(() => []),
      ]);
      setVitals(Array.isArray(vitalsList) ? vitalsList.slice(0, 50) : []);
      setPatients(Array.isArray(patientsList) ? patientsList : []);
    } catch {
      setVitals([]);
      setPatients([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const vitalType = VITAL_TYPES.find(t => t.value === form.vital_type);
    const isBp = form.vital_type === "blood_pressure";
    const valueText = isBp && form.bp_systolic && form.bp_diastolic ? `${form.bp_systolic}/${form.bp_diastolic}` : form.value_text;
    const valueNumeric = isBp && form.bp_systolic ? parseFloat(form.bp_systolic) : (form.value_numeric ? parseFloat(form.value_numeric) : null);
    try {
      await api.post("vitals", {
        patient_id: form.patient_id,
        vital_type: form.vital_type,
        value_text: valueText,
        value_numeric: Number.isFinite(valueNumeric) ? valueNumeric : null,
        unit: vitalType?.unit || null,
        notes: form.notes || null,
      });
      toast({ title: "Vital recorded" });
      setShowForm(false);
      setForm({ patient_id: "", vital_type: "blood_pressure", value_text: "", value_numeric: "", bp_systolic: "", bp_diastolic: "", notes: "" });
      fetchData();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkPatientId) {
      toast({ title: "Select a patient", variant: "destructive" });
      return;
    }
    const vitalsList = bulkRows
      .map((r) => {
        const value_text = r.value_text.trim();
        if (!value_text) return null;
        const vitalInfo = VITAL_TYPES.find((t) => t.value === r.vital_type);
        const value_numeric = r.value_numeric.trim() ? parseFloat(r.value_numeric) : null;
        return {
          vital_type: r.vital_type,
          value_text,
          value_numeric: Number.isFinite(value_numeric) ? value_numeric : null,
          unit: vitalInfo?.unit || null,
          notes: r.notes.trim() || null,
        };
      })
      .filter(Boolean);
    if (vitalsList.length === 0) {
      toast({ title: "Add at least one vital with a value", variant: "destructive" });
      return;
    }
    setSavingBulk(true);
    try {
      const res = await api.post<{ created: number }>("vitals/bulk", { patient_id: bulkPatientId, vitals: vitalsList });
      toast({ title: "Vitals recorded", description: `${res.created} vital(s) added.` });
      setShowBulkForm(false);
      setBulkPatientId("");
      setBulkRows([emptyBulkRow(), emptyBulkRow(), emptyBulkRow()]);
      fetchData();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSavingBulk(false);
    }
  };

  const addBulkRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()]);
  const updateBulkRow = (i: number, field: keyof BulkRow, value: string) => {
    setBulkRows((prev) => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
  };
  const removeBulkRow = (i: number) => setBulkRows((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Vitals</h1>
          <p className="text-muted-foreground text-sm">Track patient vital signs</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Record Vital
          </button>
          <button onClick={() => setShowBulkForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors">
            <Upload className="w-4 h-4" /> Bulk Upload
          </button>
        </div>
      </div>

      {showBulkForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowBulkForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-2xl my-8 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Bulk upload vitals</h2>
              <button type="button" onClick={() => setShowBulkForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Patient *</label>
                <select required value={bulkPatientId} onChange={(e) => setBulkPatientId(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="">Select patient...</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Value</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">Numeric</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="px-3 py-2">
                            <select value={row.vital_type} onChange={(e) => updateBulkRow(i, "vital_type", e.target.value)} className="w-full min-w-[120px] px-2 py-1.5 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50">
                              {VITAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <input placeholder={row.vital_type === "blood_pressure" ? "120/80" : "e.g. 72"} value={row.value_text} onChange={(e) => updateBulkRow(i, "value_text", e.target.value)} className="w-full min-w-[80px] px-2 py-1.5 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell">
                            <input type="number" step="0.1" placeholder="—" value={row.value_numeric} onChange={(e) => updateBulkRow(i, "value_numeric", e.target.value)} className="w-full min-w-[60px] px-2 py-1.5 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </td>
                          <td className="px-3 py-2">
                            <input placeholder="Optional" value={row.notes} onChange={(e) => updateBulkRow(i, "notes", e.target.value)} className="w-full min-w-[80px] px-2 py-1.5 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/50" />
                          </td>
                          <td className="px-2 py-1">
                            <button type="button" onClick={() => removeBulkRow(i)} className="text-muted-foreground hover:text-destructive p-1"><X className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 border-t border-border bg-muted/30">
                  <button type="button" onClick={addBulkRow} className="text-sm text-primary font-medium hover:underline">+ Add row</button>
                </div>
              </div>
              <button type="submit" disabled={savingBulk} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                {savingBulk ? "Uploading..." : `Upload ${bulkRows.filter((r) => r.value_text.trim()).length} vital(s)`}
              </button>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Record Vital</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <select required value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <select value={form.vital_type} onChange={e => setForm({ ...form, vital_type: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                {VITAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label} ({t.unit})</option>)}
              </select>
              {form.vital_type === "blood_pressure" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Upper (Systolic) mmHg</label>
                    <input required type="number" min={60} max={250} placeholder="120" value={form.bp_systolic} onChange={e => setForm({ ...form, bp_systolic: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Lower (Diastolic) mmHg</label>
                    <input required type="number" min={40} max={150} placeholder="80" value={form.bp_diastolic} onChange={e => setForm({ ...form, bp_diastolic: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  </div>
                </div>
              ) : (
                <>
                  <input required placeholder={`Value (e.g. ${form.vital_type === "heart_rate" ? "72" : "98.6"})`} value={form.value_text} onChange={e => setForm({ ...form, value_text: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                  <input placeholder="Numeric value (for charts)" type="number" step="0.1" value={form.value_numeric} onChange={e => setForm({ ...form, value_numeric: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                </>
              )}
              <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="submit" disabled={saving} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? "Recording..." : "Record Vital"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Master: Patients List */}
        <div className="glass-card rounded-xl p-4 lg:col-span-1 flex flex-col h-[600px]">
          <h2 className="font-heading font-semibold text-foreground mb-4">Patients</h2>
          {patients.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">No patients found.</p>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              <button
                onClick={() => setSelectedPatientId(null)}
                className={`w-full text-left p-3 rounded-lg transition-colors border ${selectedPatientId === null ? "bg-primary/10 border-primary/30" : "hover:bg-muted border-transparent"}`}
              >
                <p className="font-medium text-sm text-foreground">All Patients</p>
                <p className="text-xs text-muted-foreground">{vitals.length} total vitals</p>
              </button>
              {patients.map(p => {
                const pVitals = vitals.filter(v => v.patient_id === p.id);
                if (pVitals.length === 0) return null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors border ${selectedPatientId === p.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted border-transparent"}`}
                  >
                    <p className="font-medium text-sm text-foreground truncate">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{pVitals.length} records</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail: Vitals Table */}
        <div className="lg:col-span-3">
          {vitals.filter(v => !selectedPatientId || v.patient_id === selectedPatientId).length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-40" />
              No vitals recorded yet. Start by recording a patient's vitals.
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {!selectedPatientId && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>}
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Value</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vitals.filter(v => !selectedPatientId || v.patient_id === selectedPatientId).map(v => (
                      <tr key={v.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {!selectedPatientId && <td className="px-4 py-3 font-medium text-foreground">{patients.find(p => p.id === v.patient_id)?.full_name || "—"}</td>}
                        <td className="px-4 py-3 text-muted-foreground capitalize">{v.vital_type.replace("_", " ")}</td>
                        <td className="px-4 py-3 font-heading font-bold text-foreground">{v.value_text} <span className="text-xs font-normal text-muted-foreground">{v.unit}</span></td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{format(new Date(v.recorded_at), "MMM d, yyyy")}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{v.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorVitals;
