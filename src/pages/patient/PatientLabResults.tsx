import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePatientRecord } from "@/hooks/usePatientRecord";
import { api, API_BASE, getStoredToken } from "@/lib/api";
import { format } from "date-fns";
import { FileText, Plus, X, Upload, ArrowLeft, Sparkles, BookOpen, Download } from "lucide-react";
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

const PatientLabResults = ({ isEmbedded }: { isEmbedded?: boolean }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { patientId, loading: patientLoading } = usePatientRecord();
  const { data, isLoading } = useQuery({
    queryKey: ["me", "lab_results", patientId],
    queryFn: async () => {
      const [resultsData, reportsData] = await Promise.all([
        api.get<any[]>("me/lab_results").catch(() => []),
        api.get<LabReport[]>("me/lab_reports").catch(() => []),
      ]);
      return {
        results: Array.isArray(resultsData) ? resultsData : [],
        reports: Array.isArray(reportsData) ? reportsData : [],
      };
    },
    enabled: !!patientId && !patientLoading,
  });
  const results = data?.results ?? [];
  const reports = data?.reports ?? [];
  const [selectedReport, setSelectedReport] = useState<{ report: LabReport; results: LabResultRow[] } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [testName, setTestName] = useState("");
  const [resultValue, setResultValue] = useState("");
  const [unit, setUnit] = useState("");
  const [refRange, setRefRange] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loading = patientLoading || isLoading;

  const handleUpload = useCallback(async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!patientId || (!isImage && !isPdf)) {
      toast({ title: "Please choose an image (JPEG, PNG, WebP) or PDF", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await api.upload<{ report: LabReport; results: LabResultRow[] }>("me/lab_results/upload-report", formData);
      toast({ title: "Report processed", description: `${data.results?.length || 0} values extracted.` });
      setSelectedReport({ report: data.report, results: data.results || [] });
      queryClient.invalidateQueries({ queryKey: ["me", "lab_results"] });
    } catch (err) {
      toast({ title: "Upload failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [patientId, toast, queryClient]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);

  const openReport = async (reportId: string) => {
    try {
      const data = await api.get<{ report: LabReport; results: LabResultRow[] }>(`me/lab_reports/${reportId}`);
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

  const handleAdd = async () => {
    if (!patientId || !testName.trim() || !resultValue.trim()) return;
    setSaving(true);
    try {
      await api.post("me/lab_results", {
        test_name: testName,
        result_value: resultValue,
        unit: unit || null,
        reference_range: refRange || null,
        notes: notes || null,
      });
      toast({ title: "Lab result added" });
      setShowAdd(false);
      setTestName(""); setResultValue(""); setUnit(""); setRefRange(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["me", "lab_results"] });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  // Report detail view (after upload or when opening a report)
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
    return (
      <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
        <div className="sticky top-0 z-10 -mx-4 px-4 py-2 -mt-2 sm:-mx-6 sm:px-6 bg-background/95 backdrop-blur border-b border-border/50 sm:static sm:bg-transparent sm:backdrop-blur-none sm:border-0 sm:p-0 sm:mt-0">
          <button onClick={() => setSelectedReport(null)} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground touch-manipulation">
            <ArrowLeft className="w-4 h-4 shrink-0" /> Back to lab results
          </button>
        </div>
        <div className="glass-card rounded-xl p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-heading font-bold text-foreground">{report.file_name || "Lab Report"}</h2>
              <p className="text-sm text-muted-foreground">{format(new Date(report.tested_at), "MMM d, yyyy")}</p>
            </div>
            <button onClick={() => downloadReport(report.id, report.file_name || "lab_report")} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium">
              <Download className="w-4 h-4" /> Download Original
            </button>
          </div>

          {/* Extracted values table */}
          <h3 className="font-semibold text-foreground mb-2">Extracted values</h3>
          <div className="overflow-x-auto rounded-lg border border-border/50 mb-6 min-w-0 -mx-px">
            <table className="w-full min-w-[260px] text-sm">
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

          {/* Overview chart (all numeric values) */}
          {chartData.length > 0 && (
            <div className="mb-6 min-w-0">
              <h3 className="font-semibold text-foreground mb-3">Overview</h3>
              <div className="h-56 sm:h-64 min-w-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} />
                    <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
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
                    <div className="h-48 sm:h-56">
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

          {/* Clinical summary (doctor terms) */}
          {report.ai_summary && (
            <div className="mb-4 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" /> Clinical summary (for your doctor)
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{report.ai_summary}</p>
            </div>
          )}

          {/* Layman summary - Understanding your report */}
          {report.layman_summary && (
            <div className="p-4 rounded-xl bg-whatsapp/5 border border-whatsapp/20">
              <h3 className="font-semibold text-foreground flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-whatsapp" /> Understanding your report (in simple terms)
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap">{report.layman_summary}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-6">
      {!isEmbedded && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Lab Results</h1>
            <p className="text-muted-foreground text-sm">Upload a report or add results manually</p>
          </div>
          {patientId && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
                <Plus className="w-4 h-4" /> Add Lab Result
              </button>
            </div>
          )}
        </div>
      )}
      {isEmbedded && patientId && (
        <div className="flex justify-end">
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Add Lab Result
          </button>
        </div>
      )}

      {/* Upload lab report */}
      {patientId && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          className={`glass-card rounded-xl p-8 border-2 border-dashed transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <Upload className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-semibold text-foreground">Upload lab report</p>
              <p className="text-sm text-muted-foreground mt-1">Drop an image (JPEG, PNG, WebP) or PDF, or click to browse. AI will extract values and explain the report.</p>
            </div>
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50">
              <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} disabled={uploading} />
              {uploading ? "Processing…" : "Choose file"}
            </label>
          </div>
        </div>
      )}

      {/* List of uploaded reports */}
      {reports.length > 0 && (
        <div>
          <h2 className="text-lg font-heading font-semibold text-foreground mb-3">Your lab reports</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {reports.map((r) => (
              <button key={r.id} onClick={() => openReport(r.id)} className="glass-card rounded-xl p-4 text-left hover:shadow-md transition-shadow flex items-center gap-4">
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

      {/* Add Lab Result Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="glass-card rounded-2xl p-4 sm:p-6 w-full max-w-[calc(100vw-2rem)] sm:max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Add Lab Result</h2>
              <button onClick={() => setShowAdd(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Test Name *" value={testName} onChange={e => setTestName(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input placeholder="Result Value *" value={resultValue} onChange={e => setResultValue(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Unit (e.g., mg/dL)" value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <input placeholder="Ref. Range" value={refRange} onChange={e => setRefRange(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <input placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button onClick={handleAdd} disabled={!testName.trim() || !resultValue.trim() || saving} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? "Saving..." : "Save Lab Result"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All results (flat list) */}
      <div>
        <h2 className="text-lg font-heading font-semibold text-foreground mb-3">All lab results</h2>
        {results.length === 0 ? (
          <div className="glass-card rounded-xl p-6 sm:p-12 text-center text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            No lab results recorded yet. Upload a report or add one manually.
          </div>
        ) : (
          <div className="space-y-3">
            {results.map(r => (
              <div key={r.id} className="glass-card rounded-xl p-5 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-heading font-semibold text-foreground">{r.test_name}</h3>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.tested_at), "MMM d, yyyy")}</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[r.status] || ""}`}>
                    {r.status}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 pt-2 border-t border-border/50">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Result</p>
                    <p className="font-heading font-bold text-foreground truncate">{r.result_value} {r.unit && <span className="text-xs font-normal text-muted-foreground">{r.unit}</span>}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Reference Range</p>
                    <p className="text-sm text-foreground truncate">{r.reference_range || "—"}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm text-foreground truncate">{r.notes || "—"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientLabResults;
