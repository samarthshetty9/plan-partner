import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { Plus, Search, X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link, useSearchParams } from "react-router-dom";

const PAGE_SIZE = 50;

interface Patient {
  id: string;
  full_name: string;
  phone: string;
  age: number | null;
  gender: string | null;
  conditions: string[];
  status: string;
  last_check_in: string | null;
  created_at: string;
}

interface CsvRow {
  full_name: string;
  phone: string;
  age?: string;
  gender?: string;
  conditions?: string;
}

interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: string[];
}

const normalizePhone = (phone: string): string => {
  let cleaned = phone.replace(/[\s\-\(\)\.]/g, "");
  if (cleaned.startsWith("0")) cleaned = "+91" + cleaned.slice(1);
  if (!cleaned.startsWith("+")) cleaned = "+91" + cleaned;
  return cleaned;
};

const parseCsv = (text: string): CsvRow[] => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(",").map((h) => h.trim().replace(/['"]/g, ""));
  
  const nameIdx = headers.findIndex((h) => h.includes("name") || h === "full_name");
  const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("contact"));
  const ageIdx = headers.findIndex((h) => h === "age");
  const genderIdx = headers.findIndex((h) => h.includes("gender") || h.includes("sex"));
  const conditionsIdx = headers.findIndex((h) => h.includes("condition") || h.includes("diagnosis") || h.includes("disease"));

  if (nameIdx === -1 || phoneIdx === -1) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^['"]|['"]$/g, ""));
    return {
      full_name: cols[nameIdx] || "",
      phone: cols[phoneIdx] || "",
      age: ageIdx >= 0 ? cols[ageIdx] : undefined,
      gender: genderIdx >= 0 ? cols[genderIdx]?.toLowerCase() : undefined,
      conditions: conditionsIdx >= 0 ? cols[conditionsIdx] : undefined,
    };
  }).filter((r) => r.full_name && r.phone);
};

const statusColors: Record<string, string> = {
  active: "bg-whatsapp/10 text-whatsapp",
  inactive: "bg-muted text-muted-foreground",
  at_risk: "bg-destructive/10 text-destructive",
};

const Patients = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", age: "", gender: "male", conditions: "" });
  const [saving, setSaving] = useState(false);

  // Search parameters for filter
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";

  // Bulk import state
  const [showImport, setShowImport] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["patients", user?.id, page, PAGE_SIZE, status],
    queryFn: async () => {
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        skip: String(page * PAGE_SIZE),
      };
      if (status) {
        params.status = status;
      }
      const res = await api.get<{ items: Patient[]; total: number }>("patients", params);
      return { items: res.items ?? [], total: res.total ?? 0 };
    },
    enabled: !!user,
  });

  const patients = data?.items ?? [];
  const totalPatients = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalPatients / PAGE_SIZE));
  const loading = isLoading;

  // Full list only when import modal is open (for duplicate check)
  const { data: allPatientsForImport } = useQuery({
    queryKey: ["patients", "all", user?.id],
    queryFn: async () => {
      const res = await api.get<{ items: Patient[]; total: number }>("patients", { limit: "200", skip: "0" });
      return res.items ?? [];
    },
    enabled: !!user && showImport && csvRows.length > 0,
  });

  const invalidatePatients = () => {
    queryClient.invalidateQueries({ queryKey: ["patients"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      await api.post("patients", {
        full_name: form.full_name,
        phone: form.phone,
        age: form.age ? parseInt(form.age) : null,
        gender: form.gender,
        conditions: form.conditions ? form.conditions.split(",").map((c) => c.trim()) : [],
      });
      toast({ title: "Patient added" });
      setShowForm(false);
      setForm({ full_name: "", phone: "", age: "", gender: "male", conditions: "" });
      invalidatePatients();
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast({ title: "Invalid CSV", description: "CSV must have columns: name, phone. Optional: age, gender, conditions.", variant: "destructive" });
        return;
      }
      setCsvRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleBulkImport = async () => {
    if (!user || csvRows.length === 0) return;
    setImporting(true);

    const listForDupes = allPatientsForImport ?? patients;
    const existingPhones = new Set(listForDupes.map((p) => normalizePhone(p.phone)));
    const errors: string[] = [];
    let duplicates = 0;
    const toInsert: Array<{
      doctor_id: string;
      full_name: string;
      phone: string;
      age: number | null;
      gender: string | null;
      conditions: string[];
    }> = [];

    const seenPhones = new Set<string>();

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      const phone = normalizePhone(row.phone);

      // Validate phone
      if (phone.length < 10) {
        errors.push(`Row ${i + 1}: Invalid phone "${row.phone}"`);
        continue;
      }

      // Check duplicates
      if (existingPhones.has(phone) || seenPhones.has(phone)) {
        duplicates++;
        continue;
      }
      seenPhones.add(phone);

      const age = row.age ? parseInt(row.age) : null;
      const gender = row.gender && ["male", "female", "other"].includes(row.gender) ? row.gender : null;
      const conditions = row.conditions ? row.conditions.split(";").map((c) => c.trim()).filter(Boolean) : [];

      toInsert.push({
        doctor_id: user.id,
        full_name: row.full_name,
        phone,
        age: age && !isNaN(age) ? age : null,
        gender,
        conditions,
      });
    }

    let imported = 0;
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50).map(({ doctor_id: _, ...rest }) => rest);
      try {
        await api.post("patients/bulk", batch);
        imported += batch.length;
      } catch (err: unknown) {
        errors.push(`Batch ${Math.floor(i / 50) + 1}: ${(err as Error).message}`);
      }
    }

    setImportResult({ total: csvRows.length, imported, duplicates, errors });
    if (imported > 0) {
      toast({ title: `${imported} patients imported` });
      invalidatePatients();
    }
    setImporting(false);
  };

  const filtered = patients.filter((p) => p.full_name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-heading font-bold text-foreground">Patients</h1>
            {status && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/20 capitalize">
                {status.replace("_", " ")}
                <button
                  type="button"
                  onClick={() => setSearchParams({})}
                  className="inline-flex items-center justify-center p-0.5 rounded-full hover:bg-destructive/20 text-destructive transition-colors focus:outline-none"
                  title="Clear filter"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-sm">{totalPatients} total patients</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowImport(true); setCsvRows([]); setImportResult(null); }} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-foreground font-semibold text-sm hover:bg-muted transition-colors">
            <Upload className="w-4 h-4" /> Import CSV
          </button>
          <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Add Patient
          </button>
        </div>
      </div>

      {/* Add Patient Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Add Patient</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <input required placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <input required placeholder="Phone (+91...)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Age" type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <input placeholder="Conditions (comma-separated)" value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="submit" disabled={saving} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                {saving ? "Adding..." : "Add Patient"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowImport(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Import Patients from CSV</h2>
              <button onClick={() => setShowImport(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">CSV Format</p>
              <p>Required columns: <span className="font-mono text-primary">name</span> (or full_name), <span className="font-mono text-primary">phone</span> (or mobile/contact)</p>
              <p>Optional columns: <span className="font-mono text-primary">age</span>, <span className="font-mono text-primary">gender</span>, <span className="font-mono text-primary">conditions</span> (semicolon-separated)</p>
              <p className="mt-1.5 font-mono text-[10px] bg-background p-2 rounded border border-border">
                name,phone,age,gender,conditions<br />
                Rahul Sharma,+919876543210,45,male,Diabetes;Hypertension<br />
                Priya Patel,9123456789,32,female,Asthma
              </p>
            </div>

            {/* File Upload */}
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileSelect} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-lg border-2 border-dashed border-border hover:border-primary/50 text-muted-foreground hover:text-foreground transition-colors flex flex-col items-center gap-2"
            >
              <FileSpreadsheet className="w-6 h-6" />
              <span className="text-sm font-medium">{csvRows.length > 0 ? `${csvRows.length} rows loaded — click to replace` : "Choose CSV file"}</span>
            </button>

            {/* Preview */}
            {csvRows.length > 0 && !importResult && (
              <>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Name</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Phone</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Age</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Conditions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 10).map((r, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 text-foreground">{r.full_name}</td>
                          <td className="px-3 py-1.5 text-muted-foreground font-mono">{r.phone}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.age || "—"}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">{r.conditions || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 10 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1.5">...and {csvRows.length - 10} more rows</p>
                  )}
                </div>
                <button
                  onClick={handleBulkImport}
                  disabled={importing}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? "Importing..." : `Import ${csvRows.length} Patients`}
                </button>
              </>
            )}

            {/* Results */}
            {importResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-whatsapp/10">
                    <CheckCircle className="w-5 h-5 text-whatsapp mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{importResult.imported}</p>
                    <p className="text-[10px] text-muted-foreground">Imported</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-accent/10">
                    <AlertTriangle className="w-5 h-5 text-accent mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{importResult.duplicates}</p>
                    <p className="text-[10px] text-muted-foreground">Duplicates</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted">
                    <FileSpreadsheet className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{importResult.total}</p>
                    <p className="text-[10px] text-muted-foreground">Total Rows</p>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="bg-destructive/5 rounded-lg p-3 text-xs text-destructive space-y-0.5 max-h-24 overflow-y-auto">
                    {importResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
                <button
                  onClick={() => setShowImport(false)}
                  className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          placeholder="Search patients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
          {totalPatients === 0 ? "No patients yet. Add your first patient to get started." : "No patients match your search."}
        </div>
      ) : (
        <>
          <div className="glass-card rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Age</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Conditions</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <Link to={`/dashboard/patients/${p.id}`} className="hover:text-primary hover:underline transition-colors">{p.full_name}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{p.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{p.age ?? "—"}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {p.conditions?.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize whitespace-nowrap ${statusColors[p.status] || ""}`}>
                          {p.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {totalPatients} total
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:pointer-events-none"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Patients;
