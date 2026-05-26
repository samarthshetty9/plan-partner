import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, API_BASE, getStoredToken } from "@/lib/api";
import { Plus, X, FileText, Upload, ArrowLeft, Sparkles, BookOpen, Download } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend,
} from "recharts";

const statusColors: Record<string, string> = {
  normal: "bg-whatsapp/10 text-whatsapp",
  abnormal: "bg-accent/10 text-accent",
  critical: "bg-destructive/10 text-destructive",
};

interface LabChart {
  title: string;
  type: string;
  labels: string[];
  datasets: { label: string; values: number[] }[];
}

interface LabReport {
  id: string;
  file_name?: string;
  patient_id: string;
  tested_at: string;
  ai_summary?: string | null;
  layman_summary?: string | null;
  extracted_data?: { key_points?: string[]; charts?: LabChart[] } | null;
}

interface LabResultRow {
  id: string;
  test_name: string;
  result_value: string;
  unit: string | null;
  reference_range: string | null;
  status: string;
  tested_at: string;
}

const DoctorLabResults = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [results, setResults] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [reports, setReports] = useState<LabReport[]>([]);
  const [selectedPatientForReports, setSelectedPatientForReports] = useState("");
  const [selectedReport, setSelectedReport] = useState<{ report: LabReport; results: LabResultRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadPatientId, setUploadPatientId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ patient_id: "", test_name: "", result_value: "", reference_range: "", unit: "", status: "normal", notes: "" });
  const [saving, setSaving] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const [resultsList, patientsList] = await Promise.all([
        api.get<any[]>("lab_results").catch(() => []),
        api.get<{ items: any[] }>("patients", { limit: "200", skip: "0" }).then((r) => r.items ?? []).catch(() => []),
      ]);
      setResults(Array.isArray(resultsList) ? resultsList.slice(0, 100) : []);
      setPatients(Array.isArray(patientsList) ? patientsList : []);
    } catch {
      setResults([]);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchReportsForPatient = useCallback(async (patientId: string) => {
    if (!patientId) { setReports([]); return; }
    try {
      const list = await api.get<LabReport[]>("lab_reports", { patient_id: patientId });
      setReports(Array.isArray(list) ? list : []);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    if (selectedPatientId) fetchReportsForPatient(selectedPatientId);
    else setReports([]);
  }, [selectedPatientId, fetchReportsForPatient]);

  const handleUploadReport = useCallback(async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!uploadPatientId || (!isImage && !isPdf)) {
      toast({ title: "Select a patient and an image (JPEG, PNG, WebP) or PDF", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patient_id", uploadPatientId);
      const data = await api.upload<{ report: LabReport; results: LabResultRow[] }>("lab_results/upload-report", formData);
      toast({ title: "Report processed", description: `${data.results?.length || 0} values extracted.` });
      setSelectedReport({ report: data.report, results: data.results || [] });
      setShowUpload(false);
      setUploadPatientId("");
      fetchData();
      if (selectedPatientId === uploadPatientId) fetchReportsForPatient(uploadPatientId);
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [uploadPatientId, toast, fetchData, selectedPatientId, fetchReportsForPatient]);

  const openReport = async (reportId: string) => {
    try {
      const data = await api.get<{ report: LabReport; results: LabResultRow[] }>(`lab_reports/${reportId}`);
      setSelectedReport({ report: data.report, results: data.results || [] });
    } catch {
      toast({ title: "Could not load report", variant: "destructive" });
    }
  };

  const downloadReport = async (reportId: string, fileName: string) => {
    try {
      const res = await fetch(`${API_BASE}/lab_reports/${reportId}/file`, {
        headers: { Authorization: `Bearer ${getStoredToken()}`, "X-Authorization": `Bearer ${getStoredToken()}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await api.post("lab_results", {
        patient_id: form.patient_id,
        test_name: form.test_name,
        result_value: form.result_value,
        reference_range: form.reference_range || null,
        unit: form.unit || null,
        status: form.status,
        notes: form.notes || null,
      });
      toast({ title: "Lab result added" });
      setShowForm(false);
      setForm({
        patient_id: selectedPatientId || "",
        test_name: "",
        result_value: "",
        reference_range: "",
        unit: "",
        status: "normal",
        notes: "",
      });
      fetchData();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  // Report detail view
  if (selectedReport) {
    const { report, results: reportResults } = selectedReport;
    const chartData = reportResults
      .filter((r) => !isNaN(parseFloat(r.result_value)))
      .slice(0, 15)
      .map((r) => ({
        name: r.test_name.length > 14 ? r.test_name.slice(0, 14) + "…" : r.test_name,
        fullName: r.test_name,
        value: parseFloat(r.result_value),
        status: r.status,
        unit: r.unit || "",
      }));
    const patientName = patients.find((p) => p.id === report.patient_id)?.full_name || "Patient";
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedReport(null)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to lab results
        </button>
        <div className="glass-card rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-heading font-bold text-foreground">{report.file_name || "Lab Report"}</h2>
              <p className="text-sm text-muted-foreground">{patientName} · {format(new Date(report.tested_at), "MMM d, yyyy")}</p>
            </div>
            <button onClick={() => downloadReport(report.id, report.file_name || "lab_report")} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium">
              <Download className="w-4 h-4" /> Download Original
            </button>
          </div>

          <h3 className="font-semibold text-foreground mb-2">Extracted values</h3>
          <div className="overflow-x-auto rounded-lg border border-border/50 mb-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Test</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Result</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Reference</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {reportResults.map((r) => (
                  <tr key={r.id} className={`border-b border-border/50 ${r.status === "abnormal" || r.status === "critical" ? "bg-destructive/5" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.test_name}</td>
                    <td className="px-4 py-2.5 text-foreground">{r.result_value} {r.unit || ""}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.reference_range || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || ""}`}>{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {chartData.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-foreground mb-3">Overview</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", fontSize: 13 }} formatter={(val: number, _: string, entry: any) => [`${val} ${entry.payload.unit}`, entry.payload.fullName]} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                      {chartData.map((entry, index) => (
                        <Cell key={index} fill={entry.status === "abnormal" || entry.status === "critical" ? "hsl(0, 70%, 55%)" : "hsl(142, 70%, 45%)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Multiple analytics charts by category (from AI) */}
          {report.extracted_data?.charts?.length ? (
            <div className="mb-6 space-y-6">
              <h3 className="font-semibold text-foreground">Analytics by category</h3>
              {report.extracted_data.charts.map((chart, idx) => {
                const data = chart.labels.map((label, i) => {
                  const point: Record<string, string | number> = { name: label.length > 12 ? label.slice(0, 12) + "…" : label };
                  chart.datasets.forEach((ds) => { point[ds.label] = ds.values[i] ?? 0; });
                  return point;
                });
                const keys = chart.datasets.map((d) => d.label);
                const colors = ["hsl(var(--primary))", "hsl(142, 70%, 45%)", "hsl(0, 70%, 55%)"];
                return (
                  <div key={idx} className="p-4 rounded-xl border border-border/50">
                    <h4 className="font-medium text-foreground mb-3">{chart.title}</h4>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        {chart.type === "line" ? (
                          <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                            <Legend />
                            {keys.map((key, i) => (
                              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % 3]} strokeWidth={2} dot={{ r: 4 }} />
                            ))}
                          </LineChart>
                        ) : (
                          <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                            <Legend />
                            {keys.map((key, i) => (
                              <Bar key={key} dataKey={key} fill={colors[i % 3]} radius={[4, 4, 0, 0]} />
                            ))}
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {/* Key points */}
          {report.extracted_data?.key_points?.length ? (
            <div className="mb-4 p-4 rounded-xl border border-border/50">
              <h3 className="font-semibold text-foreground mb-2">Key points</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
                {report.extracted_data.key_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.ai_summary && (
            <div className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" /> Clinical summary (doctor terms)
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{report.ai_summary}</p>
            </div>
          )}

          {report.layman_summary && (
            <div className="p-4 rounded-xl bg-whatsapp/5 border border-whatsapp/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-whatsapp" /> Understanding for patient (simple terms)
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{report.layman_summary}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Lab Results</h1>
          <p className="text-muted-foreground text-sm">Upload reports or add results manually</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors">
            <Upload className="w-4 h-4" /> Upload Report
          </button>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Add Lab Result
          </button>
        </div>
      </div>

      {/* Upload report modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Upload lab report</h2>
              <button type="button" onClick={() => setShowUpload(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground">AI will extract values and generate a summary. Use an image (JPEG, PNG, WebP) or PDF.</p>
            <select required value={uploadPatientId} onChange={(e) => setUploadPatientId(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">Select patient...</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <label className="block">
              <span className="text-sm font-medium text-foreground mb-2 block">Report file (image or PDF)</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="w-full text-sm text-foreground file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadReport(f);
                  e.target.value = "";
                }}
                disabled={!uploadPatientId || uploading}
              />
            </label>
            {uploading && <p className="text-sm text-muted-foreground">Processing image…</p>}
          </div>
        </div>
      )}

      {/* View reports by patient */}
      {selectedPatientId && reports.length > 0 && (
        <div className="glass-card rounded-xl p-5 mt-6">
          <h2 className="text-lg font-heading font-semibold text-foreground mb-4">Lab reports for {patients.find(p => p.id === selectedPatientId)?.full_name}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {reports.map((r) => (
              <button key={r.id} onClick={() => openReport(r.id)} className="glass-card rounded-xl p-4 text-left hover:shadow-md transition-shadow flex items-center gap-4 border border-transparent hover:border-primary/30">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground truncate">{r.file_name || "Lab Report"}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.tested_at), "MMM d, yyyy")}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Add Lab Result</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <select required value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <input required placeholder="Test Name" value={form.test_name} onChange={e => setForm({ ...form, test_name: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <div className="grid grid-cols-2 gap-3">
                <input required placeholder="Result Value" value={form.result_value} onChange={e => setForm({ ...form, result_value: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input placeholder="Unit" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <input placeholder="Reference Range (e.g. 70-100)" value={form.reference_range} onChange={e => setForm({ ...form, reference_range: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="normal">Normal</option>
                <option value="abnormal">Abnormal</option>
                <option value="critical">Critical</option>
              </select>
              <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="submit" disabled={saving} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? "Adding..." : "Add Lab Result"}
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
                <p className="text-xs text-muted-foreground">{results.length} total results</p>
              </button>
              {patients.map(p => {
                const pResults = results.filter(r => r.patient_id === p.id);
                if (pResults.length === 0 && (!reports || !reports.some(r => r.patient_id === p.id))) return null;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPatientId(p.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors border ${selectedPatientId === p.id ? "bg-primary/10 border-primary/30" : "hover:bg-muted border-transparent"}`}
                  >
                    <p className="font-medium text-sm text-foreground truncate">{p.full_name}</p>
                    <p className="text-xs text-muted-foreground">{pResults.length} records</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail: Lab Results Table */}
        <div className="lg:col-span-3">
          {results.filter(r => !selectedPatientId || r.patient_id === selectedPatientId).length === 0 ? (
            <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              No lab results yet. Upload a report or add one manually.
            </div>
          ) : (
            <div className="glass-card rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {!selectedPatientId && <th className="text-left px-4 py-3 font-medium text-muted-foreground">Patient</th>}
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Test</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Result</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Range</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter(r => !selectedPatientId || r.patient_id === selectedPatientId).map(r => (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        {!selectedPatientId && <td className="px-4 py-3 font-medium text-foreground">{patients.find(p => p.id === r.patient_id)?.full_name || "—"}</td>}
                        <td className="px-4 py-3 text-foreground">{r.test_name}</td>
                        <td className="px-4 py-3 font-heading font-bold text-foreground">{r.result_value} {r.unit && <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>}</td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{r.reference_range || "—"}</td>
                        <td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || ""}`}>{r.status}</span></td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{format(new Date(r.tested_at), "MMM d, yyyy")}</td>
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

export default DoctorLabResults;
