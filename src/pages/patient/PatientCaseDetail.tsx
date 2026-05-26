import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Building2,
  Calendar,
  Star,
  XCircle,
  MapPin,
  DollarSign,
  Clock,
  CheckCircle2,
  User,
  Phone,
  ChevronLeft,
  IndianRupee,
  Timer,
  ShieldCheck,
  Search,
  Bell,
} from "lucide-react";

type ApprovedHospital = {
  clinic_id: string;
  clinic_name: string;
  city: string;
  quoted_price: number;
  treatment_includes: string;
  estimated_duration: string;
  notes: string;
  approved_at: string;
};

type StatusHistoryItem = {
  status: string;
  message: string;
  timestamp: string;
};

type CaseDetail = {
  id: string;
  patient_name: string;
  condition: string;
  condition_details?: string;
  status: string;
  budget_min?: number;
  budget_max?: number;
  preferred_location?: string;
  preferred_country?: string;
  created_at?: string;
  admin_notes?: string;
  matched_clinic_id?: string;
  treatment_plan?: {
    description?: string;
    estimated_cost?: number;
    estimated_duration?: string;
  };
  treatment_start_date?: string;
  treatment_end_date?: string;
  matched_clinic?: {
    id: string;
    name: string;
    city?: string;
    specialties?: string[];
  };
  matched_doctor?: {
    name: string;
    specialties?: string[];
  };
  coordinator?: {
    id: string;
    name: string;
    phone?: string;
  };
  status_history?: StatusHistoryItem[];
  approved_hospitals?: ApprovedHospital[];
};

const STATUS_LABELS: Record<string, string> = {
  submitted: "Request Submitted",
  reviewing: "Under Review",
  hospital_matched: "Hospitals Found",
  hospital_accepted: "Hospital Confirmed",
  treatment_scheduled: "Treatment Scheduled",
  treatment_in_progress: "Treatment In Progress",
  treatment_completed: "Treatment Completed",
  cancelled: "Cancelled",
};

const STATUS_MESSAGES: Record<string, string> = {
  submitted:
    "Your request has been received. Our team is reviewing it and will find the best hospitals for you.",
  reviewing:
    "Our team is actively contacting hospitals that specialize in your treatment to get the best offers within your budget.",
  hospital_matched:
    "Great news! We've found hospitals for your treatment. Review the options below and select the one you prefer. Our team will then get in touch to help you.",
  hospital_accepted:
    "You've selected your hospital. A Mediimate coordinator will contact you shortly to help with scheduling and next steps.",
  treatment_scheduled:
    "Your treatment has been scheduled. Please check the details below.",
  treatment_in_progress:
    "Your treatment is currently in progress. We wish you a speedy recovery!",
  treatment_completed:
    "Your treatment is complete. We hope everything went well!",
  cancelled: "This case has been cancelled.",
};

const formatDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "—";

const formatBudget = (min?: number, max?: number) => {
  if (!min && !max) return "—";
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min || max!);
};

const PROCESS_STEPS = [
  {
    key: "submitted",
    icon: FileText,
    label: "Request Received",
  },
  {
    key: "reviewing",
    icon: Search,
    label: "Finding Hospitals",
  },
  {
    key: "hospital_matched",
    icon: Building2,
    label: "Hospitals Found",
  },
  {
    key: "hospital_accepted",
    icon: CheckCircle2,
    label: "Hospital Confirmed",
  },
  {
    key: "treatment_completed",
    icon: Star,
    label: "Completed",
  },
];

export default function PatientCaseDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [confirmHospital, setConfirmHospital] = useState<ApprovedHospital | null>(null);

  const { data: caseData, isLoading } = useQuery<CaseDetail>({
    queryKey: ["patient", "case", id],
    queryFn: () => api.get<CaseDetail>(`me/cases/${id}`),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`me/cases/${id}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", "case", id] });
      toast.success("Case cancelled");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectHospitalMutation = useMutation({
    mutationFn: (clinic_id: string) =>
      api.patch(`me/cases/${id}/select-hospital`, { clinic_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient", "case", id] });
      queryClient.invalidateQueries({ queryKey: ["me", "cases"] });
      setConfirmHospital(null);
      toast.success("Hospital selected! Our team will contact you shortly.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reviewMutation = useMutation({
    mutationFn: (body: {
      clinic_id: string;
      case_id: string;
      rating: number;
      review_text: string;
    }) => api.post("me/hospital-reviews", body),
    onSuccess: () => {
      toast.success("Review submitted!");
      setReviewOpen(false);
      setRating(5);
      setReviewText("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancellable =
    caseData &&
    ["submitted", "reviewing", "hospital_matched"].includes(caseData.status);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Case not found.</p>
      </div>
    );
  }

  const isCancelled = caseData.status === "cancelled";
  const approvedHospitals = caseData.approved_hospitals || [];
  const statusHistory = caseData.status_history || [];
  const canSelectHospital =
    caseData.status === "hospital_matched" && approvedHospitals.length > 0;

  const stepsOrder = PROCESS_STEPS.map((s) => s.key);
  const currentStepIdx = stepsOrder.indexOf(caseData.status);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link
        to="/patient/cases"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back to My Treatment Requests
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground">
            {caseData.condition}
          </h1>
          <Badge
            className="mt-1"
            variant={isCancelled ? "destructive" : "secondary"}
          >
            {STATUS_LABELS[caseData.status] || caseData.status}
          </Badge>
        </div>
        {cancellable && (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
          >
            <XCircle className="h-4 w-4 mr-1" />
            {cancelMutation.isPending ? "Cancelling..." : "Cancel"}
          </Button>
        )}
      </div>

      {/* Status message banner */}
      <Card
        className={`border-l-4 ${
          isCancelled
            ? "border-l-destructive"
            : caseData.status === "hospital_matched"
              ? "border-l-emerald-500"
              : "border-l-primary"
        }`}
      >
        <CardContent className="p-4">
          <p className="text-sm text-foreground">
            {STATUS_MESSAGES[caseData.status] || "Processing your request..."}
          </p>
        </CardContent>
      </Card>

      {/* Progress steps */}
      {!isCancelled && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {PROCESS_STEPS.map((step, i) => {
            const done = i <= currentStepIdx;
            const active = stepsOrder[i] === caseData.status;
            const Icon = step.icon;
            return (
              <div
                key={step.key}
                className="flex items-center gap-1 flex-1 min-w-0"
              >
                <div className="flex flex-col items-center gap-1 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground/40"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span
                    className={`text-[10px] text-center leading-tight ${
                      done ? "text-foreground" : "text-muted-foreground/50"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < PROCESS_STEPS.length - 1 && (
                  <div
                    className={`h-0.5 flex-1 mx-1 rounded-full mt-[-16px] ${
                      i < currentStepIdx ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Hospital Options - THE KEY SECTION */}
      {approvedHospitals.length > 0 && (
        <Card className="border-emerald-200 dark:border-emerald-800">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-emerald-600" />
              Hospital Options for You
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
              >
                {approvedHospitals.length}{" "}
                {approvedHospitals.length === 1 ? "hospital" : "hospitals"}
              </Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {canSelectHospital
                ? "Select a hospital below. Once you confirm, our Mediimate coordinator will contact you to guide you through the next steps."
                : "These hospitals have been vetted by Mediimate for your treatment. Prices shown are confirmed and all-inclusive."}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {approvedHospitals.map((h, i) => {
              const isSelected =
                caseData.matched_clinic_id === h.clinic_id &&
                caseData.status !== "hospital_matched";
              return (
                <div
                  key={h.clinic_id}
                  className={`border rounded-xl p-4 transition-colors ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground">
                          {h.clinic_name}
                        </h3>
                        {isSelected && (
                          <Badge className="bg-primary text-primary-foreground border-0 text-[10px] gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Selected
                          </Badge>
                        )}
                        {!isSelected &&
                          i === 0 &&
                          approvedHospitals.length > 1 &&
                          canSelectHospital && (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-[10px]">
                              Best Value
                            </Badge>
                          )}
                      </div>
                      {h.city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" /> {h.city}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <IndianRupee className="h-4 w-4" />
                        {h.quoted_price?.toLocaleString("en-IN")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Fixed price
                      </p>
                    </div>
                  </div>

                  {(h.treatment_includes || h.estimated_duration) && (
                    <div className="mt-3 pt-3 border-t space-y-1.5">
                      {h.treatment_includes && (
                        <div className="flex items-start gap-2">
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            {h.treatment_includes}
                          </p>
                        </div>
                      )}
                      {h.estimated_duration && (
                        <div className="flex items-center gap-2">
                          <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            {h.estimated_duration}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {canSelectHospital && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        className="w-full"
                        onClick={() => setConfirmHospital(h)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Select {h.clinic_name}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Confirmation: Mediimate will get in touch */}
      {caseData.status === "hospital_accepted" && caseData.matched_clinic_id && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="p-5 text-center space-y-3">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Phone className="w-6 h-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground text-base">
              We'll be in touch soon!
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You've selected{" "}
              <strong className="text-foreground">
                {approvedHospitals.find(
                  (h) => h.clinic_id === caseData.matched_clinic_id
                )?.clinic_name ||
                  caseData.matched_clinic?.name ||
                  "your hospital"}
              </strong>
              . A Mediimate coordinator will contact you shortly to help with
              scheduling, paperwork, and any questions you have.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Waiting message when no hospitals yet */}
      {approvedHospitals.length === 0 &&
        !isCancelled &&
        ["submitted", "reviewing"].includes(caseData.status) && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-medium text-foreground text-sm">
                Finding the Best Hospitals for You
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Our team is reviewing your request and contacting hospitals. Once
                hospitals confirm availability and pricing, their offers will
                appear here.
              </p>
            </CardContent>
          </Card>
        )}

      {/* Status Timeline */}
      {statusHistory.length > 0 && !isCancelled && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {statusHistory.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        i === statusHistory.length - 1
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                    </div>
                    {i < statusHistory.length - 1 && (
                      <div className="w-0.5 h-6 bg-primary/30" />
                    )}
                  </div>
                  <div className="pb-3">
                    <p className="text-sm text-foreground">{item.message}</p>
                    {item.timestamp && (
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(item.timestamp).toLocaleDateString(
                          undefined,
                          { dateStyle: "medium" }
                        )}{" "}
                        at{" "}
                        {new Date(item.timestamp).toLocaleTimeString(
                          undefined,
                          { timeStyle: "short" }
                        )}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Case Information */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> Your Request Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Detail icon={FileText} label="Treatment" value={caseData.condition} />
          <Detail
            icon={DollarSign}
            label="Your Budget"
            value={formatBudget(caseData.budget_min, caseData.budget_max)}
          />
          <Detail
            icon={MapPin}
            label="Preferred Location"
            value={caseData.preferred_location || "Any"}
          />
          <Detail
            icon={Calendar}
            label="Submitted"
            value={formatDate(caseData.created_at)}
          />
        </CardContent>
        {caseData.condition_details && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              {caseData.condition_details}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Care Coordinator */}
      {caseData.coordinator && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" /> Your Mediimate Coordinator
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">{caseData.coordinator.name}</p>
              <p className="text-xs text-muted-foreground">
                Mediimate Care Coordinator
              </p>
            </div>
            {caseData.coordinator.phone && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1"
                asChild
              >
                <a href={`tel:${caseData.coordinator.phone}`}>
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Treatment Plan */}
      {caseData.treatment_plan?.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Treatment Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>{caseData.treatment_plan.description}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {caseData.treatment_plan.estimated_cost != null && (
                <Detail
                  icon={DollarSign}
                  label="Estimated Cost"
                  value={`₹${caseData.treatment_plan.estimated_cost.toLocaleString("en-IN")}`}
                />
              )}
              {caseData.treatment_plan.estimated_duration && (
                <Detail
                  icon={Clock}
                  label="Duration"
                  value={caseData.treatment_plan.estimated_duration}
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Treatment Dates */}
      {(caseData.treatment_start_date || caseData.treatment_end_date) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" /> Treatment Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Detail
              icon={Calendar}
              label="Start Date"
              value={formatDate(caseData.treatment_start_date)}
            />
            <Detail
              icon={Calendar}
              label="End Date"
              value={formatDate(caseData.treatment_end_date)}
            />
          </CardContent>
        </Card>
      )}

      {/* Review Section */}
      {caseData.status === "treatment_completed" && caseData.matched_clinic && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="h-4 w-4" /> Leave a Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Share your experience with {caseData.matched_clinic.name}.
            </p>
            <Button onClick={() => setReviewOpen(true)}>
              <Star className="h-4 w-4 mr-1" /> Write Review
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirm Hospital Selection Dialog */}
      <Dialog
        open={!!confirmHospital}
        onOpenChange={() => setConfirmHospital(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Your Hospital</DialogTitle>
          </DialogHeader>
          {confirmHospital && (
            <div className="space-y-4">
              <div className="border rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-foreground">
                  {confirmHospital.clinic_name}
                </h3>
                {confirmHospital.city && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {confirmHospital.city}
                  </p>
                )}
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                  <IndianRupee className="h-4 w-4" />
                  {confirmHospital.quoted_price?.toLocaleString("en-IN")}
                </p>
                {confirmHospital.treatment_includes && (
                  <p className="text-xs text-muted-foreground">
                    {confirmHospital.treatment_includes}
                  </p>
                )}
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  What happens next?
                </p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    Your selection will be confirmed with{" "}
                    {confirmHospital.clinic_name}
                  </li>
                  <li className="flex items-start gap-2">
                    <Phone className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    A Mediimate coordinator will call you to assist with
                    scheduling and travel arrangements
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                    We'll guide you through the entire process from start to
                    finish
                  </li>
                </ul>
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setConfirmHospital(null)}
                >
                  Go Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={selectHospitalMutation.isPending}
                  onClick={() =>
                    selectHospitalMutation.mutate(confirmHospital.clinic_id)
                  }
                >
                  {selectHospitalMutation.isPending ? (
                    <div className="animate-spin w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full mr-2" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {selectHospitalMutation.isPending
                    ? "Confirming..."
                    : "Confirm Selection"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Review {caseData.matched_clinic?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rating</Label>
              <div className="flex gap-1 mt-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className="focus:outline-none"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        n <= rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Your Review</Label>
              <Textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="How was your experience?"
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!reviewText.trim() || reviewMutation.isPending}
                onClick={() =>
                  caseData.matched_clinic &&
                  reviewMutation.mutate({
                    clinic_id: caseData.matched_clinic.id,
                    case_id: caseData.id,
                    rating,
                    review_text: reviewText.trim(),
                  })
                }
              >
                {reviewMutation.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
