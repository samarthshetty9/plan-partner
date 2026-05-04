import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { api, API_BASE, getStoredToken } from "@/lib/api";
import { toast } from "sonner";
import {
  Send,
  FileText,
  CheckCircle2,
  Search,
  Building2,
  ClipboardList,
  Bell,
  Upload,
  X,
  Shield,
  Phone,
  FileUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CasePayload {
  condition: string;
  condition_details?: string;
  budget_min?: number;
  budget_max?: number;
  preferred_location?: string;
  preferred_country?: string;
  vault_code?: string;
  patient_phone?: string;
  consent_terms_accepted: boolean;
  document_ids?: string[];
}

type UploadedDoc = { file: string; name: string };

const PROCESS_STEPS = [
  {
    icon: ClipboardList,
    title: "We receive your request",
    description:
      "Our medical team reviews your condition, budget, and documents.",
  },
  {
    icon: Search,
    title: "We find the best hospitals",
    description:
      "We contact hospitals and negotiate the best price within your budget.",
  },
  {
    icon: Building2,
    title: "Hospitals confirm availability",
    description:
      "Approved hospitals with fixed pricing are shown in your dashboard.",
  },
  {
    icon: Bell,
    title: "You choose, we coordinate",
    description:
      "Select your hospital and our team will handle everything from there.",
  },
];

const PatientCaseSubmit = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [vaultCode, setVaultCode] = useState("");
  const [vaultLoading, setVaultLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    condition: "",
    condition_details: "",
    budget_min: "",
    budget_max: "",
    preferred_location: "",
    preferred_country: "India",
    patient_phone: "",
    consent: false,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const list = await api.get<
          { vault_code?: string }[]
        >("patient_vault_codes", { patient_user_id: user.id });
        const vc = Array.isArray(list) ? list[0] : null;
        if (vc?.vault_code) setVaultCode(vc.vault_code);
      } catch {
        /* ignore */
      }
      setVaultLoading(false);
    })();
  }, [user]);

  const mutation = useMutation({
    mutationFn: (payload: CasePayload) => api.post("me/cases", payload),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to submit request");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "general");
      try {
        const token = getStoredToken();
        const res = await fetch(`${API_BASE}/me/patient_documents/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}`, "X-Authorization": `Bearer ${token}` } : {},
          body: formData,
        });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        setUploadedDocs((prev) => [
          ...prev,
          { file: data.id || data.file || "", name: file.name },
        ]);
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeDoc = (idx: number) => {
    setUploadedDocs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.condition.trim()) {
      toast.error("Please enter your treatment/condition");
      return;
    }
    if (!form.consent) {
      toast.error("Please accept the terms to proceed");
      return;
    }

    const payload: CasePayload = {
      condition: form.condition.trim(),
      condition_details: form.condition_details.trim() || undefined,
      budget_min: form.budget_min ? Number(form.budget_min) : undefined,
      budget_max: form.budget_max ? Number(form.budget_max) : undefined,
      preferred_location: form.preferred_location.trim() || undefined,
      preferred_country: form.preferred_country.trim() || undefined,
      vault_code: vaultCode.trim() || undefined,
      patient_phone: form.patient_phone.trim() || undefined,
      consent_terms_accepted: true,
      document_ids: uploadedDocs.map((d) => d.file).filter(Boolean),
    };

    mutation.mutate(payload);
  };

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  if (submitted) {
    return (
      <div className="w-full max-w-lg mx-auto space-y-6 pt-4">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            Request Received!
          </h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Your treatment request for{" "}
            <strong className="text-foreground">{form.condition}</strong> has
            been submitted. Here's what happens next:
          </p>
        </div>

        <Card>
          <CardContent className="p-5 space-y-5">
            {PROCESS_STEPS.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                      i === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <step.icon className="w-4 h-4" />
                  </div>
                  {i < PROCESS_STEPS.length - 1 && (
                    <div className="w-0.5 h-full min-h-[16px] bg-border mt-1" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-sm font-semibold text-foreground">
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 text-center">
          <p className="text-sm text-foreground font-medium">
            We'll notify you as soon as hospitals are available.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Track your request anytime in My Cases.
          </p>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              setSubmitted(false);
              setForm({
                condition: "",
                condition_details: "",
                budget_min: "",
                budget_max: "",
                preferred_location: "",
                preferred_country: "India",
                patient_phone: "",
                consent: false,
              });
              setUploadedDocs([]);
            }}
          >
            Submit Another Request
          </Button>
          <Button className="flex-1" onClick={() => navigate("/patient/cases")}>
            View My Cases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
          Request Treatment
        </h1>
        <p className="text-muted-foreground text-sm">
          Tell us what you need. Our team will find the best hospitals within
          your budget and share their offers with you.
        </p>
      </div>

      {/* How it works */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-sm font-medium text-foreground mb-2">
            How it works
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROCESS_STEPS.map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{step.title}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Treatment Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="w-5 h-5" /> Treatment Details
            </CardTitle>
            <CardDescription>
              Provide details about your condition. The more you share, the
              better we can match you.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="condition">What treatment do you need? *</Label>
              <Input
                id="condition"
                placeholder="e.g. Knee Replacement, Heart Bypass, Dental Implants, IVF"
                value={form.condition}
                onChange={(e) => update("condition", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition_details">
                Tell us more about your condition
              </Label>
              <Textarea
                id="condition_details"
                placeholder="Describe your symptoms, diagnosis, medical history, previous treatments tried..."
                value={form.condition_details}
                onChange={(e) => update("condition_details", e.target.value)}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget_min">Budget Minimum (₹)</Label>
                <Input
                  id="budget_min"
                  type="number"
                  min={0}
                  placeholder="e.g. 200000"
                  value={form.budget_min}
                  onChange={(e) => update("budget_min", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget_max">Budget Maximum (₹)</Label>
                <Input
                  id="budget_max"
                  type="number"
                  min={0}
                  placeholder="e.g. 500000"
                  value={form.budget_max}
                  onChange={(e) => update("budget_max", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preferred_location">Preferred City</Label>
                <Input
                  id="preferred_location"
                  placeholder="e.g. Mumbai, Chennai, Delhi"
                  value={form.preferred_location}
                  onChange={(e) => update("preferred_location", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferred_country">Preferred Country</Label>
                <Input
                  id="preferred_country"
                  placeholder="e.g. India"
                  value={form.preferred_country}
                  onChange={(e) =>
                    update("preferred_country", e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documents Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileUp className="w-5 h-5" /> Medical Documents
            </CardTitle>
            <CardDescription>
              Upload medical reports, prescriptions, scans, or any documents
              that will help hospitals understand your case. These will be shared
              with the hospitals we contact on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadedDocs.length > 0 && (
              <div className="space-y-2">
                {uploadedDocs.map((doc, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 border"
                  >
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm text-foreground flex-1 truncate">
                      {doc.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      Uploaded
                    </Badge>
                    <button
                      type="button"
                      onClick={() => removeDoc(i)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {uploading ? "Uploading..." : "Upload Documents"}
              </Button>
              <span className="text-xs text-muted-foreground">
                PDF, images, or any medical files
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx"
              multiple
              className="hidden"
              onChange={handleFileUpload}
            />
          </CardContent>
        </Card>

        {/* Vault Code & Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Shield className="w-5 h-5" /> Health Vault & Contact
            </CardTitle>
            <CardDescription>
              Your vault code lets Mediimate securely share your health records
              with hospitals. Your phone number helps our coordinator reach you
              faster.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vault_code">Health Vault Code</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="vault_code"
                  placeholder="e.g. ABCD1234"
                  value={vaultCode}
                  onChange={(e) =>
                    setVaultCode(e.target.value.toUpperCase())
                  }
                  className="font-mono tracking-widest"
                />
                {vaultLoading && (
                  <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full shrink-0" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Find your code in{" "}
                <a
                  href="/patient/vault"
                  className="text-primary hover:underline"
                >
                  Health Vault
                </a>
                . This allows us to share your records with hospitals securely.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="patient_phone">Phone Number *</Label>
              <Input
                id="patient_phone"
                type="tel"
                placeholder="+91 98765 43210"
                value={form.patient_phone}
                onChange={(e) => update("patient_phone", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Our coordinator will use this to contact you about your case.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Terms & Consent */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent"
                checked={form.consent}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({
                    ...prev,
                    consent: checked === true,
                  }))
                }
                className="mt-0.5"
              />
              <label
                htmlFor="consent"
                className="text-sm text-foreground leading-relaxed cursor-pointer"
              >
                I authorize Mediimate to share my medical details, documents,
                and health vault data with partner hospitals for the purpose of
                obtaining treatment quotes and facilitating my care. I agree to
                the{" "}
                <span className="text-primary font-medium">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="text-primary font-medium">Privacy Policy</span>
                .
              </label>
            </div>

            {!form.consent && (
              <p className="text-xs text-muted-foreground pl-7">
                You must accept the terms above to submit your request.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div>
          <Button
            type="submit"
            disabled={mutation.isPending || !form.consent}
            className="w-full sm:w-auto min-h-[48px] text-base"
          >
            {mutation.isPending ? (
              <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {mutation.isPending
              ? "Submitting..."
              : "Submit Treatment Request"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PatientCaseSubmit;
