import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, API_BASE, getStoredToken } from "@/lib/api";
import { Plus, X, Upload, FileText, Download, Trash2, ArrowLeft, Sparkles, BookOpen, BarChart3, Pill } from "lucide-react";
import { format } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const categoryColors: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  lab: "bg-primary/10 text-primary",
  prescription: "bg-accent/10 text-accent",
  imaging: "bg-whatsapp/10 text-whatsapp",
  insurance: "bg-muted text-muted-foreground",
};

interface ExtractedMedication {
  medicine: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  timing_display: string;
  suggested_time: string;
  food_relation: string;
  timings: string[];
}

interface DocDetail {
  id: string;
  file_name: string;
  category: string;
  created_at: string;
  patient_id: string;
  ai_summary?: string | null;
  layman_summary?: string | null;
  extracted_data?: {
    key_points?: string[];
    chart_data?: { labels: string[]; datasets: { label: string; values: number[] }[] };
    prescription_summary?: string;
    medications?: ExtractedMedication[];
  } | null;
  analyzed_at?: string | null;
}

const DoctorDocuments = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ patient_id: "", category: "general", notes: "" });
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocDetail | null>(null);

  const fetchData = async () => {
    if (!user) return;
    try {
      const [docsList, patientsList] = await Promise.all([
        api.get<any[]>("patient_documents").catch(() => []),
        api.get<{ items: any[] }>("patients", { limit: "200", skip: "0" }).then((r) => r.items ?? []).catch(() => []),
      ]);
      setDocuments(Array.isArray(docsList) ? docsList : []);
      setPatients(Array.isArray(patientsList) ? patientsList : []);
    } catch {
      setDocuments([]);
      setPatients([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, analyze: boolean) => {
    const file = e.target.files?.[0];
    if (!file || !form.patient_id || !user) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (analyze && !isPdf && !isImage) {
      toast({ title: "For analysis use image or PDF", variant: "destructive" });
      return;
    }
    if (analyze) setAnalyzing(true);
    else setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("patient_id", form.patient_id);
      formData.append("category", form.category);
      if (form.notes) formData.append("notes", form.notes);
      const path = analyze ? "patient_documents/upload-and-analyze" : "patient_documents/upload";
      const res = analyze
        ? await api.upload<DocDetail>(path, formData)
        : await fetch(`${API_BASE}/${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getStoredToken()}`, "X-Authorization": `Bearer ${getStoredToken()}` },
            body: formData,
          }).then((r) => r.ok ? r.json() : Promise.reject(new Error("Upload failed")));
      toast({ title: analyze ? "Document uploaded and analyzed" : "Document uploaded" });
      setShowForm(false);
      setForm({ patient_id: "", category: "general", notes: "" });
      if (analyze && (res as DocDetail)?.id) setSelectedDoc(res as DocDetail);
      fetchData();
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
      setUploading(false);
    }
  };

  const openDoc = async (id: string) => {
    try {
      const doc = await api.get<DocDetail>(`patient_documents/${id}`);
      setSelectedDoc(doc);
    } catch {
      toast({ title: "Could not load document", variant: "destructive" });
    }
  };

  const downloadFile = async (docId: string, fileName: string) => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/patient_documents/${docId}/file`, {
        headers: { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  };

  const deleteDoc = async (id: string) => {
    try {
      await api.delete(`patient_documents/${id}`);
      if (selectedDoc?.id === id) setSelectedDoc(null);
      fetchData();
      toast({ title: "Document deleted" });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Document detail view
  if (selectedDoc) {
    const cd = selectedDoc.extracted_data?.chart_data;
    const chartData = cd?.labels?.map((label, i) => {
      const point: Record<string, string | number> = { name: label.length > 12 ? label.slice(0, 12) + "…" : label };
      cd.datasets?.forEach((ds) => { point[ds.label] = ds.values[i] ?? 0; });
      return point;
    }) ?? [];
    const chartKeys = cd?.datasets?.map((d) => d.label) ?? [];
    const patientName = patients.find(p => p.id === selectedDoc.patient_id)?.full_name ?? "—";

    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedDoc(null)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to documents
        </button>
        <div className="glass-card rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-heading font-bold text-foreground">{selectedDoc.file_name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-sm text-muted-foreground font-medium">{patientName}</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${categoryColors[selectedDoc.category] || ""}`}>{selectedDoc.category}</span>
                <span className="text-sm text-muted-foreground">{format(new Date(selectedDoc.created_at), "MMM d, yyyy")}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => downloadFile(selectedDoc.id, selectedDoc.file_name)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium">
                <Download className="w-4 h-4" /> Download
              </button>
              <button onClick={() => deleteDoc(selectedDoc.id)} className="p-2 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {selectedDoc.ai_summary && (
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" /> Summary
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedDoc.ai_summary}</p>
            </div>
          )}

          {selectedDoc.layman_summary && (
            <div className="p-4 rounded-xl bg-whatsapp/5 border border-whatsapp/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-whatsapp" /> In simple terms
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedDoc.layman_summary}</p>
            </div>
          )}

          {selectedDoc.extracted_data?.prescription_summary && (
            <div className="p-4 rounded-xl bg-accent/5 border border-accent/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <Pill className="w-4 h-4 text-accent" /> Prescription summary
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedDoc.extracted_data.prescription_summary}</p>
            </div>
          )}

          {selectedDoc.extracted_data?.medications?.length ? (
            <div className="p-4 rounded-xl border border-border/50">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
                <Pill className="w-4 h-4" /> Medications
              </h3>
              <ul className="space-y-3">
                {selectedDoc.extracted_data.medications.map((med, i) => (
                  <li key={i} className="p-3 rounded-lg bg-muted/30 border border-border/50 text-sm">
                    <p className="font-medium text-foreground">{med.medicine}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                      {med.dosage && <span>Dosage: {med.dosage}</span>}
                      {med.frequency && <span>Frequency: {med.frequency}</span>}
                      {med.duration && <span>Duration: {med.duration}</span>}
                      {med.timing_display && <span>When: {med.timing_display}</span>}
                      {med.suggested_time && <span>Time: {med.suggested_time}</span>}
                      {med.food_relation && <span>Food: {med.food_relation}</span>}
                      {med.timings?.length ? <span>Times: {med.timings.join(", ")}</span> : null}
                    </div>
                    {med.instructions && <p className="mt-1 text-muted-foreground">{med.instructions}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {selectedDoc.extracted_data?.key_points?.length ? (
            <div className="p-4 rounded-xl border border-border/50">
              <h3 className="font-semibold text-foreground mb-2">Key points</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-foreground">
                {selectedDoc.extracted_data.key_points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {chartData.length > 0 && chartKeys.length > 0 && (
            <div className="p-4 rounded-xl border border-border/50">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4" /> Analytics
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
                    <Legend />
                    {chartKeys.map((key, i) => (
                      <Bar key={key} dataKey={key} fill={["hsl(var(--primary))", "hsl(142, 70%, 45%)", "hsl(0, 70%, 55%)"][i % 3]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {!selectedDoc.ai_summary && !selectedDoc.layman_summary && !selectedDoc.extracted_data?.prescription_summary && !selectedDoc.extracted_data?.medications?.length && !selectedDoc.extracted_data?.key_points?.length && chartData.length === 0 && (
            <p className="text-sm text-muted-foreground">No analysis for this document. You can download it above.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground text-sm">{documents.length} patient documents</p>
        </div>
        <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Upload Document</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <select required value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="general">General</option>
                <option value="lab">Lab Report</option>
                <option value="prescription">Prescription</option>
                <option value="imaging">Imaging</option>
                <option value="insurance">Insurance</option>
              </select>
              <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <p className="text-xs text-muted-foreground">Upload & analyze: use image or PDF for AI summary and charts.</p>
              <div className="flex gap-2">
                <label className={`flex-1 py-6 rounded-lg border-2 border-dashed border-primary bg-primary/5 text-center transition-colors ${form.patient_id && !analyzing ? "cursor-pointer hover:bg-primary/10" : "opacity-50 cursor-not-allowed"}`}>
                  <Upload className="w-6 h-6 text-primary mx-auto mb-1" />
                  <p className="text-xs font-medium text-foreground">Upload & analyze</p>
                  <p className="text-[10px] text-muted-foreground">Image or PDF</p>
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => handleUpload(e, true)} disabled={analyzing || !form.patient_id} />
                </label>
                <label className={`flex-1 py-6 rounded-lg border-2 border-dashed border-border bg-muted/30 text-center transition-colors ${form.patient_id && !uploading ? "cursor-pointer hover:border-primary/50" : "opacity-50 cursor-not-allowed"}`}>
                  <FileText className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs font-medium text-foreground">Upload only</p>
                  <p className="text-[10px] text-muted-foreground">Any file</p>
                  <input type="file" className="hidden" onChange={(e) => handleUpload(e, false)} disabled={uploading || !form.patient_id} />
                </label>
              </div>
              {(uploading || analyzing) && <p className="text-sm text-muted-foreground text-center">{analyzing ? "Analyzing…" : "Uploading…"}</p>}
            </div>
          </div>
        </div>
      )}

      {documents.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
          <Upload className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No documents yet.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map(d => (
            <div
              key={d.id}
              onClick={() => openDoc(d.id)}
              className="glass-card rounded-xl p-4 flex items-center justify-between gap-4 cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm text-foreground truncate">{d.file_name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span className="font-medium">{patients.find(p => p.id === d.patient_id)?.full_name ?? "—"}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${categoryColors[d.category] || ""}`}>{d.category}</span>
                    <span>{format(new Date(d.created_at), "MMM d, yyyy")}</span>
                    {d.file_size_bytes && <span>{formatSize(d.file_size_bytes)}</span>}
                    {d.analyzed_at && <span className="text-whatsapp">Analyzed</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => downloadFile(d.id, d.file_name)} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <Download className="w-4 h-4" />
                </button>
                <button onClick={() => deleteDoc(d.id)} className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DoctorDocuments;
