import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Search, Send, Clock, CheckCircle, XCircle, Stethoscope } from "lucide-react";

interface LinkRequest {
  id: string;
  doctor_id: string;
  status: string;
  created_at?: string;
}

interface ConnectedDoctor {
  doctor_id: string;
  doctor_name: string;
  patient_id: string;
}

const PatientConnectDoctor = () => {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [linkRequests, setLinkRequests] = useState<LinkRequest[]>([]);
  const [connectedDoctors, setConnectedDoctors] = useState<ConnectedDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorCode, setDoctorCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = async () => {
    if (!user) return;
    try {
      const [list, links] = await Promise.all([
        api.get<LinkRequest[]>("me/link_requests"),
        api.get<ConnectedDoctor[]>("me/doctors"),
      ]);
      setLinkRequests(Array.isArray(list) ? list : []);
      setConnectedDoctors(Array.isArray(links) ? links : []);
    } catch {
      setLinkRequests([]);
      setConnectedDoctors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !doctorCode.trim()) return;
    setSubmitting(true);
    try {
      await api.post("me/link_requests", { doctor_code: doctorCode.trim().toUpperCase(), message: message.trim() || null });
      toast({ title: "Request sent!", description: "Your link request has been sent to the doctor." });
      setDoctorCode("");
      setMessage("");
      fetchRequests();
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const isLinked = !!(session?.patient as any)?.id;
  const pending = linkRequests.find((r) => r.status === "pending");
  const lastDenied = linkRequests.find((r) => r.status === "denied");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 sm:max-w-lg sm:mx-auto space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Connect to doctor</h1>
        <p className="text-muted-foreground text-sm mt-1">Link your account to a doctor using their doctor code</p>
      </div>

      {(isLinked || connectedDoctors.length > 0) && (
        <div className="glass-card rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-10 h-10 text-primary shrink-0" />
            <div>
              <p className="font-medium text-foreground">Connected doctors</p>
              <p className="text-sm text-muted-foreground">You can be connected to multiple doctors for different treatments. Request more links below.</p>
            </div>
          </div>
          {connectedDoctors.length > 0 && (
            <ul className="mt-3 space-y-2">
              {connectedDoctors.map((link) => (
                <li key={link.doctor_id} className="flex items-center gap-2 py-2 px-3 rounded-lg bg-muted/50">
                  <Stethoscope className="w-4 h-4 text-primary" />
                  <span className="font-medium text-foreground">{link.doctor_name || "Doctor"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pending && !isLinked && (
        <div className="glass-card rounded-xl p-4 sm:p-6 text-center">
          <Clock className="w-12 h-12 text-accent mx-auto mb-3" />
          <h2 className="text-lg font-heading font-bold text-foreground mb-1">Request pending</h2>
          <p className="text-sm text-muted-foreground">Your link request has been sent. You’ll get access once the doctor approves it.</p>
        </div>
      )}

      {lastDenied && !pending && !isLinked && (
        <div className="glass-card rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-10 h-10 text-destructive shrink-0" />
          <div>
            <p className="font-medium text-foreground">Previous request was denied</p>
            <p className="text-sm text-muted-foreground">You can try again with the correct doctor code below.</p>
          </div>
        </div>
      )}

      <div className="glass-card rounded-xl p-4 sm:p-6 space-y-4">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <Search className="w-5 h-5" />
          Request link with doctor code
        </h2>
        <p className="text-sm text-muted-foreground">Ask your doctor for their code (they can find it in their dashboard) and enter it below.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Doctor code</label>
            <input
              required
              placeholder="e.g. DRABC12"
              value={doctorCode}
              onChange={(e) => setDoctorCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-center text-base sm:text-lg font-heading tracking-wider sm:tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-primary/50"
              maxLength={12}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Message (optional)</label>
            <input
              placeholder="e.g. My name on file is Jane Smith"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !doctorCode.trim()}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
            {submitting ? "Sending…" : "Send link request"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PatientConnectDoctor;
