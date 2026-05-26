import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Briefcase,
  CalendarDays,
  DollarSign,
  Building2,
  Eye,
  XCircle,
  CheckCircle2,
  Clock,
  Search,
  Ban,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface CaseItem {
  id: string;
  condition: string;
  condition_details?: string;
  status: string;
  budget_min?: number;
  budget_max?: number;
  matched_clinic_name?: string;
  matched_clinic_id?: string;
  approved_hospital_count?: number;
  created_at: string;
  updated_at?: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; message: string; color: string; icon: React.ElementType }
> = {
  submitted: {
    label: "Request Received",
    message: "We're reviewing your request",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    icon: Clock,
  },
  reviewing: {
    label: "Finding Hospitals",
    message: "We're contacting hospitals for you",
    color:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: Search,
  },
  hospital_matched: {
    label: "Hospitals Found",
    message: "Hospital options are ready — select one to proceed",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: Building2,
  },
  hospital_accepted: {
    label: "Hospital Selected",
    message: "Mediimate coordinator will contact you shortly",
    color:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle2,
  },
  treatment_scheduled: {
    label: "Treatment Scheduled",
    message: "Your treatment is scheduled",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    icon: CalendarDays,
  },
  treatment_in_progress: {
    label: "In Progress",
    message: "Treatment is underway",
    color:
      "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
    icon: Clock,
  },
  treatment_completed: {
    label: "Completed",
    message: "Treatment completed",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    icon: Star,
  },
  cancelled: {
    label: "Cancelled",
    message: "Case cancelled",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    icon: Ban,
  },
};

const CANCELLABLE = new Set(["submitted", "reviewing", "hospital_matched"]);

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    message: "",
    color: "bg-muted text-muted-foreground",
    icon: Clock,
  };
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} border-0 gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

const PatientCases = () => {
  const queryClient = useQueryClient();

  const { data: cases, isLoading } = useQuery<CaseItem[]>({
    queryKey: ["me", "cases"],
    queryFn: () => api.get<CaseItem[]>("me/cases"),
  });

  const cancelMutation = useMutation({
    mutationFn: (caseId: string) =>
      api.patch("me/cases/" + caseId + "/cancel", {}),
    onSuccess: () => {
      toast.success("Case cancelled");
      queryClient.invalidateQueries({ queryKey: ["me", "cases"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to cancel case");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const items = Array.isArray(cases) ? cases : [];

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Briefcase className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
            <h1 className="text-xl sm:text-2xl md:text-3xl font-heading font-semibold text-foreground">
              My Treatment Requests
            </h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Track your treatment requests. We'll find the best hospitals for
            you.
          </p>
        </div>
        <Button asChild>
          <Link to="/patient/cases/new">
            <Briefcase className="w-4 h-4 mr-2" /> New Request
          </Link>
        </Button>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-12 text-center space-y-3">
            <Briefcase className="w-10 h-10 mx-auto opacity-40 text-muted-foreground" />
            <p className="text-muted-foreground">No treatment requests yet.</p>
            <p className="text-sm text-muted-foreground">
              Submit a treatment request and our team will find the best
              hospitals within your budget.
            </p>
            <Button asChild className="mt-2">
              <Link to="/patient/cases/new">Submit Your First Request</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((c) => {
            const config = STATUS_CONFIG[c.status];
            const hospitalCount = c.approved_hospital_count || 0;
            return (
              <Card key={c.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading font-semibold text-foreground truncate">
                        {c.condition}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={c.status} />
                        {hospitalCount > 0 && (
                          <Badge
                            variant="outline"
                            className="gap-1 text-emerald-700 border-emerald-300 dark:text-emerald-400"
                          >
                            <Building2 className="w-3 h-3" />
                            {hospitalCount}{" "}
                            {hospitalCount === 1 ? "hospital" : "hospitals"}{" "}
                            found
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/patient/cases/${c.id}`}>
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          {c.status === "hospital_matched"
                            ? "Select Hospital"
                            : "View"}
                        </Link>
                      </Button>
                      {CANCELLABLE.has(c.status) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(c.id)}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Status message */}
                  {config?.message && (
                    <p className="text-xs text-muted-foreground">
                      {config.message}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {(c.budget_min != null || c.budget_max != null) && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" />₹
                        {c.budget_min?.toLocaleString("en-IN") ?? "–"} – ₹
                        {c.budget_max?.toLocaleString("en-IN") ?? "–"}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {new Date(c.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PatientCases;
