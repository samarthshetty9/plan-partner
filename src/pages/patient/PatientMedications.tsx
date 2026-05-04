import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { api, API_BASE, getStoredToken } from "@/lib/api";
import { Pill, Plus, Upload, Trash2, Clock, X, ImagePlus, Loader2, CheckCircle } from "lucide-react";

type Medication = {
  id: string;
  medicine: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  timing_display?: string;
  suggested_time?: string;
  food_relation?: string;
  timings?: string[];
  active: boolean;
  source: string;
  added_at: string;
};

const PatientMedications = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: medications, isLoading } = useQuery({
    queryKey: ["me", "medications"],
    queryFn: () => api.get<Medication[]>("me/medications"),
    enabled: !!user,
  });

  // Upload prescription state
  const [uploading, setUploading] = useState(false);
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionPreview, setPrescriptionPreview] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ prescription_summary?: string; medications_count: number } | null>(null);

  // Manual add state
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    medicine: "", dosage: "", frequency: "", duration: "",
    instructions: "", timing_display: "", suggested_time: "", food_relation: "",
  });
  const [savingManual, setSavingManual] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPrescriptionFile(file);
    setUploadResult(null);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPrescriptionPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPrescriptionPreview(null);
    }
  }, []);

  const handleUploadPrescription = async () => {
    if (!prescriptionFile) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", prescriptionFile);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/me/medications/upload-prescription`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      const result = await res.json();
      setUploadResult({ prescription_summary: result.prescription_summary, medications_count: result.medications_count });
      queryClient.invalidateQueries({ queryKey: ["me", "medications"] });
      queryClient.invalidateQueries({ queryKey: ["me", "patient_documents"] });
      toast({
        title: result.medications_count > 0
          ? `${result.medications_count} medication${result.medications_count > 1 ? "s" : ""} added from prescription`
          : "Prescription uploaded",
        description: result.ai_error || undefined,
      });
      setPrescriptionFile(null);
      setPrescriptionPreview(null);
    } catch (e) {
      toast({ title: "Upload failed", description: (e as Error).message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleManualSave = async () => {
    if (!manualForm.medicine.trim()) {
      toast({ title: "Medicine name required", variant: "destructive" });
      return;
    }
    setSavingManual(true);
    try {
      await api.post("me/medications", manualForm);
      queryClient.invalidateQueries({ queryKey: ["me", "medications"] });
      setManualForm({ medicine: "", dosage: "", frequency: "", duration: "", instructions: "", timing_display: "", suggested_time: "", food_relation: "" });
      setShowManual(false);
      toast({ title: "Medication added" });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
    setSavingManual(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`me/medications/${id}`);
      queryClient.invalidateQueries({ queryKey: ["me", "medications"] });
      toast({ title: "Medication removed" });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await api.patch(`me/medications/${id}`, { active: !active });
      queryClient.invalidateQueries({ queryKey: ["me", "medications"] });
    } catch (e) {
      toast({ title: "Failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const meds = Array.isArray(medications) ? medications : [];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill className="w-6 h-6 text-primary" />
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">My Medications</h1>
        </div>
        <span className="text-sm text-muted-foreground">{meds.filter(m => m.active).length} active</span>
      </div>

      {/* Upload Prescription */}
      <div className="glass-card rounded-xl p-4 sm:p-5 space-y-4 border border-border">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <Upload className="w-5 h-5 text-primary" />
          Upload Prescription
        </h2>
        <p className="text-sm text-muted-foreground">Upload a prescription image or PDF. AI will extract medications automatically.</p>

        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <label className="flex flex-col items-center justify-center w-full sm:w-48 h-36 rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors">
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
            {prescriptionPreview ? (
              <img src={prescriptionPreview} alt="Prescription" className="w-full h-full object-cover rounded-xl" />
            ) : prescriptionFile ? (
              <div className="text-center p-3">
                <Pill className="w-8 h-8 text-muted-foreground mx-auto mb-1" />
                <span className="text-xs text-muted-foreground break-all">{prescriptionFile.name}</span>
              </div>
            ) : (
              <>
                <ImagePlus className="w-8 h-8 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Upload image or PDF</span>
              </>
            )}
          </label>
          {prescriptionFile && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleUploadPrescription}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 touch-manipulation"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? "Analyzing..." : "Analyze & Add Medications"}
              </button>
              <button
                type="button"
                onClick={() => { setPrescriptionFile(null); setPrescriptionPreview(null); setUploadResult(null); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {uploadResult && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                {uploadResult.medications_count} medication{uploadResult.medications_count !== 1 ? "s" : ""} extracted
              </span>
            </div>
            {uploadResult.prescription_summary && (
              <p className="text-xs text-muted-foreground whitespace-pre-line mt-1">{uploadResult.prescription_summary}</p>
            )}
          </div>
        )}
      </div>

      {/* Add Manually */}
      <div className="glass-card rounded-xl p-4 sm:p-5 border border-border">
        {!showManual ? (
          <button
            type="button"
            onClick={() => setShowManual(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors touch-manipulation"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium text-sm">Add Medication Manually</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-semibold text-foreground">Add Medication</h3>
              <button type="button" onClick={() => setShowManual(false)} className="p-1 rounded-lg hover:bg-muted">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Medicine name *</label>
                <input
                  type="text"
                  value={manualForm.medicine}
                  onChange={e => setManualForm(f => ({ ...f, medicine: e.target.value }))}
                  placeholder="e.g. Amlodipine 5mg"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Dosage</label>
                <input
                  type="text"
                  value={manualForm.dosage}
                  onChange={e => setManualForm(f => ({ ...f, dosage: e.target.value }))}
                  placeholder="e.g. 1 tablet"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Frequency</label>
                <select
                  value={manualForm.frequency}
                  onChange={e => setManualForm(f => ({ ...f, frequency: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select</option>
                  <option value="Once a day">Once a day</option>
                  <option value="Twice daily">Twice daily</option>
                  <option value="Three times a day">Three times a day</option>
                  <option value="As needed">As needed</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration</label>
                <input
                  type="text"
                  value={manualForm.duration}
                  onChange={e => setManualForm(f => ({ ...f, duration: e.target.value }))}
                  placeholder="e.g. 30 days"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Timing</label>
                <select
                  value={manualForm.timing_display}
                  onChange={e => setManualForm(f => ({ ...f, timing_display: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select</option>
                  <option value="Morning">Morning</option>
                  <option value="Afternoon">Afternoon</option>
                  <option value="Evening">Evening</option>
                  <option value="Night">Night</option>
                  <option value="Morning and Night">Morning and Night</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Food relation</label>
                <select
                  value={manualForm.food_relation}
                  onChange={e => setManualForm(f => ({ ...f, food_relation: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Select</option>
                  <option value="before food">Before food</option>
                  <option value="after food">After food</option>
                  <option value="with food">With food</option>
                  <option value="any time">Any time</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Instructions</label>
                <input
                  type="text"
                  value={manualForm.instructions}
                  onChange={e => setManualForm(f => ({ ...f, instructions: e.target.value }))}
                  placeholder="e.g. As directed"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleManualSave}
                disabled={savingManual}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 touch-manipulation"
              >
                {savingManual ? "Saving..." : "Save Medication"}
              </button>
              <button
                type="button"
                onClick={() => setShowManual(false)}
                className="px-4 py-2.5 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Medication List */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading medications...</div>
      ) : meds.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No medications yet</p>
          <p className="text-sm mt-1">Upload a prescription or add medications manually</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-heading font-semibold text-foreground">
            Active Medications ({meds.filter(m => m.active).length})
          </h2>
          {meds.map((med) => (
            <div
              key={med.id}
              className={`rounded-xl border p-4 transition-colors ${
                med.active
                  ? "border-border bg-card"
                  : "border-border/50 bg-muted/30 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground text-sm">{med.medicine}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      med.source === "prescription"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {med.source === "prescription" ? "From Rx" : "Manual"}
                    </span>
                    {!med.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600">Inactive</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    {med.dosage && <span>Dose: {med.dosage}</span>}
                    {med.frequency && <span>Freq: {med.frequency}</span>}
                    {med.duration && <span>Duration: {med.duration}</span>}
                    {med.timing_display && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {med.timing_display}
                      </span>
                    )}
                    {med.food_relation && <span>{med.food_relation}</span>}
                    {med.instructions && <span>{med.instructions}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(med.id, med.active)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium touch-manipulation ${
                      med.active
                        ? "bg-muted text-muted-foreground hover:bg-muted/80"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    {med.active ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(med.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-500/10 touch-manipulation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PatientMedications;
