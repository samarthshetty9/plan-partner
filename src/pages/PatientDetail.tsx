import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import {
  ArrowLeft, Phone, User, Calendar, Activity, TrendingUp, AlertTriangle,
  FileText, FlaskConical, Heart, ClipboardList, Stethoscope, UtensilsCrossed, Pill, MessageSquare
} from "lucide-react";
import DoctorCopilot from "@/components/DoctorCopilot";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function formatDate(value: string | Date | null | undefined, fmt: string): string {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, fmt);
}
import PatientVitalsTab from "@/components/patient-detail/PatientVitalsTab";
import PatientLabsTab from "@/components/patient-detail/PatientLabsTab";
import PatientDocsTab from "@/components/patient-detail/PatientDocsTab";
import PatientAlertsTab from "@/components/patient-detail/PatientAlertsTab";
import PatientFoodTab from "@/components/patient-detail/PatientFoodTab";

interface Patient {
  id: string;
  full_name: string;
  phone: string;
  age: number | null;
  gender: string | null;
  conditions: string[] | null;
  medications: string[] | null;
  emergency_contact: string | null;
  status: string;
  created_at: string;
  last_check_in: string | null;
}

interface Enrollment {
  id: string;
  program_id: string;
  status: string;
  adherence_pct: number | null;
  enrolled_at: string;
  completed_at: string | null;
  program_name?: string;
  program_type?: string;
}

interface Appointment {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
}

const statusColors: Record<string, string> = {
  active: "bg-whatsapp/10 text-whatsapp",
  inactive: "bg-muted text-muted-foreground",
  at_risk: "bg-destructive/10 text-destructive",
  completed: "bg-primary/10 text-primary",
  paused: "bg-muted text-muted-foreground",
  dropped: "bg-destructive/10 text-destructive",
  scheduled: "bg-primary/10 text-primary",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [counts, setCounts] = useState({ vitals: 0, labs: 0, docs: 0, alerts: 0, food: 0, medicationLogs: 0 });

  const refreshCounts = async () => {
    if (!id) return;
    try {
      const [vitalsCount, labsCount, docsCount, alertsCount, foodCount, medLogsCountRes] = await Promise.all([
        api.get<{ count: number }>("vitals", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
        api.get<{ count: number }>("lab_results", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
        api.get<{ count: number }>("patient_documents", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
        api.get<{ count: number }>("alerts", { patient_id: id, status: "open", count: "true" }).catch(() => ({ count: 0 })),
        api.get<{ count: number }>("food_logs", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
        api.get<{ count: number }>(`patients/${id}/medication-logs`, { count: "true" }).catch(() => ({ count: 0 })),
      ]);
      setCounts({
        vitals: (vitalsCount as { count?: number })?.count ?? 0,
        labs: (labsCount as { count?: number })?.count ?? 0,
        docs: (docsCount as { count?: number })?.count ?? 0,
        alerts: (alertsCount as { count?: number })?.count ?? 0,
        food: (foodCount as { count?: number })?.count ?? 0,
        medicationLogs: (medLogsCountRes as { count?: number })?.count ?? 0,
      });
    } catch { /* ignore */ }
  };
  const [medicationLogs, setMedicationLogs] = useState<{ id: string; logged_at: string; taken: boolean; time_of_day?: string; medication_name?: string; source?: string }[]>([]);
  const [medicationLogsTotal, setMedicationLogsTotal] = useState(0);
  const [medicationLogsLoadingMore, setMedicationLogsLoadingMore] = useState(false);
  const [doctorMessage, setDoctorMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    setError(null);
    if (!id) {
      setLoading(false);
      setError("Invalid patient ID");
      return;
    }
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const fetchAll = async () => {
      setLoading(true);
      try {
        const patientRes = await api.get<Patient>("patients/" + id);
        setPatient(patientRes);

        const [enrollRes, apptRes, programRes, vitalsCount, labsCount, docsCount, alertsCount, foodCount, medLogsCountRes, medLogsList] = await Promise.all([
          api.get<Enrollment[]>("enrollments", { patient_id: id }).catch(() => []),
          api.get<Appointment[]>("appointments", { patient_id: id }).catch(() => []),
          api.get<{ id: string; name: string; type: string }[]>("programs").catch(() => []),
          api.get<{ count: number }>("vitals", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ count: number }>("lab_results", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ count: number }>("patient_documents", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ count: number }>("alerts", { patient_id: id, status: "open", count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ count: number }>("food_logs", { patient_id: id, count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ count: number }>(`patients/${id}/medication-logs`, { count: "true" }).catch(() => ({ count: 0 })),
          api.get<{ items: { id: string; logged_at: string; taken: boolean; time_of_day?: string; medication_name?: string; source?: string }[]; total: number }>(`patients/${id}/medication-logs`, { limit: "20", skip: "0" }).catch(() => ({ items: [], total: 0 })),
        ]);
        setCounts({
          vitals: (vitalsCount as { count?: number })?.count ?? 0,
          labs: (labsCount as { count?: number })?.count ?? 0,
          docs: (docsCount as { count?: number })?.count ?? 0,
          alerts: (alertsCount as { count?: number })?.count ?? 0,
          food: (foodCount as { count?: number })?.count ?? 0,
          medicationLogs: (medLogsCountRes as { count?: number })?.count ?? 0,
        });
        const medData = medLogsList as { items?: unknown[]; total?: number };
        setMedicationLogs(Array.isArray(medData?.items) ? medData.items as { id: string; logged_at: string; taken: boolean; time_of_day?: string; medication_name?: string; source?: string }[] : []);
        setMedicationLogsTotal(typeof medData?.total === "number" ? medData.total : 0);
        const programMap: Record<string, { name: string; type: string }> = {};
        (programRes || []).forEach((p) => { programMap[p.id] = { name: p.name, type: p.type }; });
        if (enrollRes?.length) {
          setEnrollments(enrollRes.map((e) => ({
            ...e,
            adherence_pct: e.adherence_pct ? Number(e.adherence_pct) : null,
            program_name: programMap[e.program_id]?.name || "Unknown",
            program_type: programMap[e.program_id]?.type || "",
          })));
        }
        if (apptRes?.length) setAppointments(apptRes);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not load patient.";
        if (msg.includes("401") || msg.toLowerCase().includes("unauthorized")) setError("Please log in again.");
        else if (msg.includes("404") || msg.toLowerCase().includes("not found")) setError("Patient not found.");
        else setError("Could not load patient. Is the API server running? (npm run dev:server)");
      }
      setLoading(false);
    };
    fetchAll();
  }, [user, id, authLoading]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (error || !patient) return (
    <div className="text-center py-12 space-y-4 max-w-md mx-auto">
      <p className="text-muted-foreground">{error || "Patient not found."}</p>
      <p className="text-sm text-muted-foreground">Ensure the API server is running (npm run dev:server) and you’re logged in as the doctor who owns this patient.</p>
      <Link to="/dashboard/patients" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">← Back to Patients</Link>
    </div>
  );

  const avgAdherence = enrollments.length > 0
    ? Math.round(enrollments.reduce((s, e) => s + (e.adherence_pct ?? 0), 0) / enrollments.length)
    : null;

  const upcomingAppts = appointments.filter((a) => new Date(a.scheduled_at) >= new Date() && a.status === "scheduled");
  const pastAppts = appointments.filter((a) => new Date(a.scheduled_at) < new Date() || a.status !== "scheduled");

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back link */}
      <Link to="/dashboard/patients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation min-h-[44px]">
        <ArrowLeft className="w-4 h-4" /> Back to Patients
      </Link>

      {/* Patient Header */}
      <div className="glass-card rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">{patient.full_name}</h1>
                <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium capitalize whitespace-nowrap ${statusColors[patient.status] || ""}`}>
                  {patient.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-1.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground">
                {patient.age && <span>{patient.age} years</span>}
                {patient.gender && <span className="capitalize">{patient.gender}</span>}
                {patient.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {patient.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-xs sm:text-sm text-muted-foreground ml-14 sm:ml-0 shrink-0">
            <p>Added {formatDate(patient.created_at, "MMM d, yyyy")}</p>
            {patient.last_check_in && <p>Last check-in: {formatDate(patient.last_check_in, "MMM d, yyyy")}</p>}
          </div>
        </div>

        {/* Conditions & Medications */}
        <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-border/50">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Conditions</p>
            <div className="flex flex-wrap gap-1.5">
              {patient.conditions?.length ? patient.conditions.map((c) => (
                <span key={c} className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{c}</span>
              )) : <span className="text-sm text-muted-foreground">None recorded</span>}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Medications</p>
            <div className="flex flex-wrap gap-1.5">
              {patient.medications?.length ? patient.medications.map((m) => (
                <span key={m} className="px-2.5 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium">{m}</span>
              )) : <span className="text-sm text-muted-foreground">None recorded</span>}
            </div>
          </div>
          {patient.emergency_contact && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Emergency Contact</p>
              <p className="text-sm text-foreground">{patient.emergency_contact}</p>
            </div>
          )}
        </div>
      </div>

      {/* Doctor message to patient */}
      <div className="glass-card rounded-xl p-3 sm:p-5">
        <h3 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-primary" />
          Message patient
        </h3>
        <p className="text-sm text-muted-foreground mb-3">They will see this in the app (e.g. &quot;Please log BP daily&quot;).</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={doctorMessage}
            onChange={(e) => setDoctorMessage(e.target.value)}
            placeholder="e.g. Please log your BP every morning"
            className="flex-1 min-w-0 px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            type="button"
            disabled={!doctorMessage.trim() || sendingMessage}
            onClick={async () => {
              if (!id || !doctorMessage.trim()) return;
              setSendingMessage(true);
              try {
                await api.post(`patients/${id}/message`, { message: doctorMessage.trim() });
                setDoctorMessage("");
              } finally {
                setSendingMessage(false);
              }
            }}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {sendingMessage ? "Sending..." : "Send"}
          </button>
        </div>
      </div>

      {/* Quick Stats — horizontal scroll on mobile, grid on larger screens */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
        <div className="flex sm:grid sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3 min-w-max sm:min-w-0">
          {[
            { icon: Activity, color: "text-primary", value: enrollments.length, label: "Programs", tab: "overview" },
            { icon: TrendingUp, color: "text-whatsapp", value: avgAdherence !== null ? `${avgAdherence}%` : "—", label: "Adherence", tab: "overview" },
            { icon: Heart, color: "text-destructive", value: counts.vitals, label: "Vitals", tab: "vitals" },
            { icon: FlaskConical, color: "text-accent", value: counts.labs, label: "Lab Results", tab: "labs" },
            { icon: FileText, color: "text-primary", value: counts.docs, label: "Documents", tab: "documents" },
            { icon: AlertTriangle, color: "text-destructive", value: counts.alerts, label: "Open Alerts", tab: "alerts" },
            { icon: UtensilsCrossed, color: "text-primary", value: counts.food, label: "Food Logs", tab: "food" },
            { icon: Pill, color: "text-violet-500", value: counts.medicationLogs, label: "Med logs", tab: "medication" },
          ].map(({ icon: Icon, color, value, label, tab }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="glass-card rounded-xl p-3 text-center min-w-[5.5rem] flex-shrink-0 sm:flex-shrink sm:min-w-0 cursor-pointer hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none"
            >
              <Icon className={`w-4 h-4 ${color} mx-auto mb-1`} />
              <p className="text-lg font-heading font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 w-full min-w-0">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0">
          <TabsList className="inline-flex sm:flex sm:w-full bg-muted/50 p-1 rounded-xl min-h-[44px] flex-nowrap gap-0.5 sm:gap-1 [&>button]:min-h-[40px] [&>button]:touch-manipulation [&>button]:flex-shrink-0">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <Stethoscope className="w-3.5 h-3.5 flex-shrink-0" /> Overview
            </TabsTrigger>
            <TabsTrigger value="vitals" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <Heart className="w-3.5 h-3.5 flex-shrink-0" /> Vitals
            </TabsTrigger>
            <TabsTrigger value="labs" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <FlaskConical className="w-3.5 h-3.5 flex-shrink-0" /> Labs
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" /> Docs
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0" /> Appts
            </TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="food" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <UtensilsCrossed className="w-3.5 h-3.5 flex-shrink-0" /> Food
            </TabsTrigger>
            <TabsTrigger value="medication" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-3">
              <Pill className="w-3.5 h-3.5 flex-shrink-0" /> Medication
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6 mt-4 min-w-0 overflow-x-hidden">
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Enrollments */}
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-primary" /> Program Enrollments
              </h3>
              {enrollments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enrolled in any programs.</p>
              ) : (
                <div className="space-y-2">
                  {enrollments.map((e) => (
                    <div key={e.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">{e.program_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[e.status] || ""}`}>{e.status}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Enrolled {formatDate(e.enrolled_at, "MMM d, yyyy")}</span>
                        <span className={`font-medium ${(e.adherence_pct ?? 0) >= 80 ? "text-whatsapp" : (e.adherence_pct ?? 0) >= 50 ? "text-primary" : "text-destructive"}`}>
                          {e.adherence_pct ?? 0}% adherence
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${(e.adherence_pct ?? 0) >= 80 ? "bg-whatsapp" : (e.adherence_pct ?? 0) >= 50 ? "bg-primary" : "bg-destructive"}`}
                          style={{ width: `${Math.min(e.adherence_pct ?? 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Appointments */}
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-accent" /> Recent Appointments
              </h3>
              {appointments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No appointments.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {upcomingAppts.slice(0, 3).map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">{a.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || ""}`}>{a.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(a.scheduled_at, "MMM d, yyyy 'at' HH:mm")} • {a.duration_minutes} min</p>
                    </div>
                  ))}
                  {pastAppts.slice(0, 3).map((a) => (
                    <div key={a.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">{a.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || ""}`}>{a.status.replace("_", " ")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(a.scheduled_at, "MMM d, yyyy 'at' HH:mm")} • {a.duration_minutes} min</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Vitals Tab */}
        <TabsContent value="vitals" className="min-w-0 overflow-x-hidden mt-4">
          <PatientVitalsTab patientId={patient.id} doctorId={user!.id} />
        </TabsContent>

        {/* Labs Tab */}
        <TabsContent value="labs" className="min-w-0 overflow-x-hidden mt-4">
          <PatientLabsTab patientId={patient.id} doctorId={user!.id} />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="min-w-0 overflow-x-hidden mt-4">
          <PatientDocsTab patientId={patient.id} doctorId={user!.id} />
        </TabsContent>

        {/* Appointments Tab */}
        <TabsContent value="appointments" className="space-y-4 min-w-0 overflow-x-hidden mt-4">
          <div className="glass-card rounded-xl p-5 space-y-3">
            <h3 className="font-heading font-semibold text-foreground">All Appointments</h3>
            {appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments scheduled.</p>
            ) : (
              <div className="space-y-2">
                {upcomingAppts.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming ({upcomingAppts.length})</p>
                )}
                {upcomingAppts.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">{a.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || ""}`}>{a.status}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(a.scheduled_at, "MMM d, yyyy 'at' HH:mm")}</span>
                      <span>{a.duration_minutes} min</span>
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                  </div>
                ))}
                {pastAppts.length > 0 && (
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mt-3">Past ({pastAppts.length})</p>
                )}
                {pastAppts.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm text-foreground">{a.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || ""}`}>{a.status.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDate(a.scheduled_at, "MMM d, yyyy 'at' HH:mm")}</span>
                      <span>{a.duration_minutes} min</span>
                    </div>
                    {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="min-w-0 overflow-x-hidden mt-4">
          <PatientAlertsTab patientId={patient.id} doctorId={user!.id} />
        </TabsContent>

        {/* Food Tab */}
        <TabsContent value="food" className="min-w-0 overflow-x-hidden mt-4">
          <PatientFoodTab patientId={patient.id} doctorId={user!.id} onLogAdded={refreshCounts} />
        </TabsContent>

        {/* Medication adherence tab: list of logs (taken/skipped, time, medication name) */}
        <TabsContent value="medication" className="space-y-4 min-w-0 overflow-x-hidden mt-4">
          <div className="glass-card rounded-xl p-5 space-y-3">
            <h3 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <Pill className="w-4 h-4 text-violet-500" /> Medication adherence
            </h3>
            <p className="text-sm text-muted-foreground">
              Logs from the patient app (Quick Log). Patient adds their medication list in <strong>Overview → Health Profile</strong> and marks when they took them from the AI Assistant.
            </p>
            {medicationLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No medication logs yet. Ask the patient to add medications in Overview and use Quick Log to mark when they take them.</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {medicationLogs.map((log) => (
                    <div key={log.id} className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-2 ${log.taken ? "border-primary/30 bg-primary/5" : "border-border/50 bg-muted/20"}`}>
                      <div className="min-w-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${log.taken ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {log.taken ? "Taken" : "Skipped"}
                        </span>
                        {log.medication_name && <span className="ml-2 text-sm text-foreground">{log.medication_name}</span>}
                        {log.time_of_day && <span className="ml-2 text-xs text-muted-foreground capitalize">{log.time_of_day}</span>}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(log.logged_at, "MMM d, HH:mm")}</span>
                    </div>
                  ))}
                </div>
                {medicationLogs.length < medicationLogsTotal && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!id || medicationLogsLoadingMore) return;
                      setMedicationLogsLoadingMore(true);
                      try {
                        const res = await api.get<{ items: { id: string; logged_at: string; taken: boolean; time_of_day?: string; medication_name?: string; source?: string }[]; total: number }>(`patients/${id}/medication-logs`, { limit: "20", skip: String(medicationLogs.length) });
                        const data = res as { items?: typeof medicationLogs; total?: number };
                        if (Array.isArray(data?.items)) setMedicationLogs((prev) => [...prev, ...data.items!]);
                      } finally {
                        setMedicationLogsLoadingMore(false);
                      }
                    }}
                    disabled={medicationLogsLoadingMore}
                    className="mt-3 w-full py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {medicationLogsLoadingMore ? "Loading…" : `Load more (${medicationLogs.length} of ${medicationLogsTotal})`}
                  </button>
                )}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Clinical Copilot FAB */}
      <DoctorCopilot patientId={patient.id} patientName={patient.full_name} />
    </div>
  );
};

export default PatientDetail;
