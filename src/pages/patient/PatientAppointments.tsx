import { useEffect, useState, useCallback } from "react";
import { usePatientRecord } from "@/hooks/usePatientRecord";
import { api } from "@/lib/api";
import { format, addDays, isBefore, startOfDay } from "date-fns";
import { Link } from "react-router-dom";
import { CalendarDays, Plus, X, Clock, Link2, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary",
  requested: "bg-amber-500/10 text-amber-500",
  completed: "bg-whatsapp/10 text-whatsapp",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-muted text-muted-foreground",
};

interface Slot {
  start: string;
  end: string;
  scheduled_at: string;
}

interface MyDoctor {
  doctor_id: string;
  doctor_name: string;
  patient_id: string;
}

const PatientAppointments = () => {
  const { patientId, loading: patientLoading } = usePatientRecord();
  const { toast } = useToast();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctors, setDoctors] = useState<MyDoctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<MyDoctor | null>(null);
  const [step, setStep] = useState<"doctor" | "date" | "slot" | "details">("doctor");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsReason, setSlotsReason] = useState<string | undefined>(undefined);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "10:00",
    duration_minutes: "30",
    notes: "",
  });

  const fetchAppointments = useCallback(async () => {
    if (!patientId) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<any[]>("me/appointments");
      setAppointments(Array.isArray(data) ? data : []);
    } catch {
      setAppointments([]);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    if (!patientLoading) fetchAppointments();
  }, [patientLoading, fetchAppointments]);

  const fetchDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const data = await api.get<MyDoctor[]>("me/doctors");
      setDoctors(Array.isArray(data) ? data : []);
    } catch {
      setDoctors([]);
    }
    setDoctorsLoading(false);
  }, []);

  const fetchSlotsForDate = useCallback(async (date: string, doctorId: string) => {
    setSlotsLoading(true);
    setSlotsReason(undefined);
    try {
      const data = await api.get<{ date: string; slots: Slot[]; reason?: string }>("me/available_slots", { date, doctor_id: doctorId });
      setSlots(data.slots || []);
      setSlotsReason(data.reason);
    } catch {
      setSlots([]);
      setSlotsReason(undefined);
    }
    setSlotsLoading(false);
  }, []);

  const openScheduleModal = () => {
    setShowForm(true);
    setSelectedDoctor(null);
    setStep("doctor");
    setSelectedDate(format(new Date(), "yyyy-MM-dd"));
    setSlots([]);
    setForm({ title: "", date: format(new Date(), "yyyy-MM-dd"), time: "10:00", duration_minutes: "30", notes: "" });
    fetchDoctors();
  };

  const onSelectDoctor = (doc: MyDoctor) => {
    setSelectedDoctor(doc);
    setStep("date");
  };

  const onSelectDate = (date: string) => {
    setSelectedDate(date);
    setForm((f) => ({ ...f, date }));
    setStep("slot");
    if (selectedDoctor) fetchSlotsForDate(date, selectedDoctor.doctor_id);
  };

  const onSelectSlot = (slot: Slot) => {
    setForm((f) => ({
      ...f,
      date: selectedDate,
      time: slot.start.length === 5 ? slot.start : slot.start.slice(0, 5),
    }));
    setStep("details");
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Please enter a reason for the visit", variant: "destructive" });
      return;
    }
    if (!selectedDoctor) {
      toast({ title: "Please select a doctor", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const scheduledAt = new Date(`${form.date}T${form.time}`).toISOString();
      await api.post("me/appointments", {
        title: form.title.trim(),
        scheduled_at: scheduledAt,
        duration_minutes: parseInt(form.duration_minutes, 10) || 30,
        notes: form.notes.trim() || null,
        doctor_id: selectedDoctor.doctor_id,
      });
      toast({ title: "Appointment requested" });
      setShowForm(false);
      setStep("doctor");
      setSelectedDoctor(null);
      setForm({ title: "", date: format(new Date(), "yyyy-MM-dd"), time: "10:00", duration_minutes: "30", notes: "" });
      fetchAppointments();
    } catch (err: unknown) {
      const msg = (err as Error).message;
      if (msg.includes("not linked") || msg.includes("404")) {
        toast({ title: "Link to a doctor first", description: "Connect with your doctor from the Connect Doctor page.", variant: "destructive" });
      } else {
        toast({ title: "Could not schedule", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  const formatSlotTime = (start: string) => {
    const [h, m] = start.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return format(d, "h:mm a");
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>;

  const upcoming = appointments.filter(a => new Date(a.scheduled_at) >= new Date() && (a.status === "scheduled" || a.status === "requested"));
  const past = appointments.filter(a => new Date(a.scheduled_at) < new Date() || (a.status !== "scheduled" && a.status !== "requested"));

  const today = startOfDay(new Date());
  const next14Days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  const needDoctorStep = doctors.length > 1;
  const hasNoDoctors = !doctorsLoading && doctors.length === 0 && patientId;

  return (
    <div className="w-full max-w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground truncate">Appointments</h1>
          <p className="text-muted-foreground text-sm">Schedule with your doctor or view your history</p>
        </div>
        <button
          type="button"
          onClick={openScheduleModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Schedule appointment
        </button>
      </div>

      {/* Schedule appointment modal */}
      {showForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="glass-card rounded-2xl p-4 sm:p-6 w-full max-w-[calc(100vw-2rem)] sm:max-w-md space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">
                {step === "doctor" && "Who are you visiting?"}
                {step === "date" && "Choose a date"}
                {step === "slot" && "Choose a time"}
                {step === "details" && "Appointment details"}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {!patientId ? (
              <p className="text-sm text-muted-foreground">Connect with your doctor first from the Connect Doctor page, then you can request appointments here.</p>
            ) : hasNoDoctors ? (
              <div className="py-6 px-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-3">
                <Link2 className="w-10 h-10 mx-auto text-primary" />
                <p className="font-medium text-foreground">Connect with a doctor first</p>
                <p className="text-sm text-muted-foreground">You don’t have any doctors linked yet. Ask your doctor for their <strong>doctor code</strong>, go to Connect Doctor, enter the code, and submit a request. After they approve, you can book here.</p>
                <Link to="/patient/connect-doctor" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
                  Go to Connect Doctor
                </Link>
              </div>
            ) : (
              <>
                {step === "doctor" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Select the doctor you want to see and the reason for your visit. Then we’ll show that doctor’s availability.</p>
                    {doctorsLoading ? (
                      <div className="flex items-center justify-center py-8"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
                    ) : doctors.length === 1 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Booking with <strong>{doctors[0].doctor_name}</strong></p>
                        <div>
                          <label className="text-sm font-medium text-foreground mb-1 block">Reason for visit</label>
                          <input
                            placeholder="e.g. Follow-up, Check-up, New symptoms"
                            value={form.title}
                            onChange={e => setForm({ ...form, title: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </div>
                        <button type="button" onClick={() => { setSelectedDoctor(doctors[0]); setStep("date"); }} className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
                          Continue to choose date
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {doctors.map((doc) => (
                          <button
                            key={doc.doctor_id}
                            type="button"
                            onClick={() => onSelectDoctor(doc)}
                            className="w-full flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary bg-background hover:bg-primary/5 text-left transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Stethoscope className="w-5 h-5 text-primary" />
                            </div>
                            <span className="font-medium text-foreground">{doc.doctor_name}</span>
                          </button>
                        ))}
                        <p className="text-xs text-muted-foreground mt-2">You’ll choose the reason for your visit after selecting a doctor.</p>
                      </div>
                    )}
                  </div>
                )}

                {step === "date" && selectedDoctor && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Booking with <strong>{selectedDoctor.doctor_name}</strong>. Select a date to see their free time slots.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {next14Days.map((d) => {
                        const dateStr = format(d, "yyyy-MM-dd");
                        const isPast = isBefore(d, today);
                        return (
                          <button
                            key={dateStr}
                            type="button"
                            disabled={isPast}
                            onClick={() => onSelectDate(dateStr)}
                            className={`py-2.5 min-h-[44px] rounded-lg border text-sm font-medium transition-colors touch-manipulation ${selectedDate === dateStr ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"} ${isPast ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            {format(d, "EEE")}
                            <br />
                            <span className="text-xs">{format(d, "MMM d")}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => setStep("doctor")} className="text-sm text-muted-foreground hover:text-foreground">← Change doctor</button>
                  </div>
                )}

                {step === "slot" && selectedDoctor && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Free slots with <strong>{selectedDoctor.doctor_name}</strong> for {format(new Date(selectedDate + "T12:00:00"), "EEEE, MMM d")}. Booked slots are hidden.</p>
                    {slotsLoading ? (
                      <div className="flex items-center justify-center py-8"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
                    ) : slotsReason === "connect_required" ? (
                      <div className="py-6 px-4 rounded-xl bg-primary/10 border border-primary/20 text-center space-y-3">
                        <Link2 className="w-10 h-10 mx-auto text-primary" />
                        <p className="font-medium text-foreground">Connect with your doctor first</p>
                        <p className="text-sm text-muted-foreground">To see available times, link your account via Connect Doctor (use your doctor’s code).</p>
                        <Link to="/patient/connect-doctor" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90">
                          Go to Connect Doctor
                        </Link>
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="py-6 text-center text-muted-foreground text-sm">
                        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        {slotsReason === "no_availability_for_day"
                          ? "This doctor hasn’t set availability for this day. Try another date."
                          : "No free slots on this day. Try another date."}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {slots.map((slot) => (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => onSelectSlot(slot)}
                            className="py-2.5 min-h-[44px] rounded-lg border border-border hover:border-primary bg-background hover:bg-primary/5 text-sm font-medium transition-colors touch-manipulation"
                          >
                            {formatSlotTime(slot.start)}
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setStep("date")} className="text-sm text-muted-foreground hover:text-foreground">← Change date</button>
                  </div>
                )}

                {step === "details" && selectedDoctor && (
                  <form onSubmit={handleSchedule} className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      <strong>{selectedDoctor.doctor_name}</strong> · {format(new Date(selectedDate + "T12:00:00"), "EEEE, MMM d")} at {formatSlotTime(form.time)}
                    </p>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Reason for visit</label>
                      <input
                        required
                        placeholder="e.g. Follow-up, Check-up"
                        value={form.title}
                        onChange={e => setForm({ ...form, title: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Duration</label>
                      <select
                        value={form.duration_minutes}
                        onChange={e => setForm({ ...form, duration_minutes: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">60 min</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground mb-1 block">Notes (optional)</label>
                      <textarea
                        placeholder="Any details for your doctor"
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                        rows={2}
                        className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setStep("slot")}
                        className="flex-1 py-2.5 rounded-lg border border-border font-medium text-sm hover:bg-muted/50 transition-colors"
                      >
                        ← Back
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {saving ? "Scheduling…" : "Request appointment"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {appointments.length === 0 ? (
        <div className="glass-card rounded-xl p-6 sm:p-12 text-center text-muted-foreground">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No appointments yet.</p>
          <p className="text-sm mt-2">Click “Schedule appointment” to choose a doctor and see their available times.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Upcoming</h3>
              <div className="glass-card rounded-xl divide-y divide-border/50">
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4 text-center">No upcoming appointments</p>
                ) : (
                  upcoming.map((a) => (
                    <div key={a.id} className="p-3 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <CalendarDays className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{a.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{format(new Date(a.scheduled_at), "MMM d, yyyy")}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {format(new Date(a.scheduled_at), "h:mm a")} ({a.duration_minutes}m)</span>
                          </div>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium capitalize shrink-0 ${statusColors[a.status] || ""}`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Past</h3>
              {past.map(a => (
                <div key={a.id} className="glass-card rounded-xl p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm text-foreground">{a.title}</h4>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColors[a.status] || ""}`}>{a.status.replace("_", " ")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{format(new Date(a.scheduled_at), "MMM d, yyyy 'at' HH:mm")} • {a.duration_minutes} min</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PatientAppointments;
