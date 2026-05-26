import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { format } from "date-fns";
import { Star, MessageSquare, Video, Quote, X, Send, Plus, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FeedbackItem {
  id: string;
  doctor_id: string;
  doctor_name: string;
  doctor_rating: number;
  clinic_rating?: number;
  review_text?: string;
  video_url?: string;
  video_path?: string;
  is_testimonial: boolean;
  consent_to_publish: boolean;
  created_at: string;
}

const DoctorFeedback = () => {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTestimonial, setFilterTestimonial] = useState<boolean | "all">("all");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [patients, setPatients] = useState<{ id: string; full_name: string }[]>([]);
  const [showSendForm, setShowSendForm] = useState(false);
  const [sendForm, setSendForm] = useState({ patient_id: "", message: "", rating: 0 });
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const playVideo = useCallback(async (feedbackId: string) => {
    setVideoLoading(true);
    setVideoUrl(null);
    try {
      const url = await api.getFeedbackVideoUrl(feedbackId);
      setVideoUrl(url);
    } catch {
      setVideoUrl(null);
    }
    setVideoLoading(false);
  }, []);

  const closeVideo = useCallback(() => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
  }, [videoUrl]);

  useEffect(() => {
    if (!user) return;
    const params: Record<string, string> = {};
    if (filterTestimonial === true) params.is_testimonial = "true";
    api
      .get<FeedbackItem[]>("feedbacks", params)
      .then((data) => setFeedbacks(Array.isArray(data) ? data : []))
      .catch(() => setFeedbacks([]))
      .finally(() => setLoading(false));
    // Fetch patients for send form
    api.get<{ items: { id: string; full_name: string }[] }>("patients", { limit: "200", skip: "0" })
      .then((r) => setPatients(r.items ?? []))
      .catch(() => setPatients([]));
  }, [user, filterTestimonial]);

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sendForm.patient_id || !sendForm.message.trim()) {
      toast({ title: "Select a patient and write a message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      await api.post("clinical_feedback", {
        patient_id: sendForm.patient_id,
        message: sendForm.message.trim(),
        rating: sendForm.rating || null,
      });
      toast({ title: "Feedback sent to patient" });
      setShowSendForm(false);
      setSendForm({ patient_id: "", message: "", rating: 0 });
    } catch (err) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
    setSending(false);
  };

  const avgRating =
    feedbacks.length > 0
      ? feedbacks.reduce((s, f) => s + (f.doctor_rating || 0), 0) / feedbacks.filter((f) => f.doctor_rating).length
      : 0;
  const testimonialCount = feedbacks.filter((f) => f.is_testimonial).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Patient feedback</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ratings and reviews from patients after completed appointments. Video testimonials appear when patients opt in.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSendForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            <Send className="w-4 h-4" /> Send Feedback
          </button>
          <button
            type="button"
            onClick={() => setFilterTestimonial("all")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterTestimonial === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilterTestimonial(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              filterTestimonial === true ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Quote className="w-4 h-4" /> Testimonials ({testimonialCount})
          </button>
        </div>
      </div>

      {/* Send Feedback Modal */}
      {showSendForm && (
        <div className="fixed inset-0 bg-foreground/20 z-50 flex items-center justify-center p-4" onClick={() => setShowSendForm(false)}>
          <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-heading font-bold text-foreground">Send Clinical Feedback</h2>
              <button onClick={() => setShowSendForm(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground">Send personalized clinical feedback or progress notes to a patient. They'll see this in their notifications.</p>
            <form onSubmit={handleSendFeedback} className="space-y-3">
              <select required value={sendForm.patient_id} onChange={e => setSendForm({ ...sendForm, patient_id: e.target.value })} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50">
                <option value="">Select patient...</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Progress Rating (optional)</label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setSendForm({ ...sendForm, rating: sendForm.rating === n ? 0 : n })} className="p-1">
                      <Star className={`w-6 h-6 ${sendForm.rating >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/30"}`} />
                    </button>
                  ))}
                </div>
              </div>
              <textarea required placeholder="Write your clinical feedback, progress notes, or encouragement..." value={sendForm.message} onChange={e => setSendForm({ ...sendForm, message: e.target.value })} rows={4} className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none" />
              <button type="submit" disabled={sending} className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:opacity-90 disabled:opacity-50">
                {sending ? "Sending..." : "Send Feedback"}
              </button>
            </form>
          </div>
        </div>
      )}

      {feedbacks.length === 0 ? (
        <div className="glass-card rounded-xl p-12 text-center text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium text-foreground">No feedback yet</p>
          <p className="text-sm mt-2">
            When patients complete appointments and submit feedback, it will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="glass-card rounded-xl p-4 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Star className="w-8 h-8 fill-amber-400 text-amber-500" />
              <span className="text-2xl font-heading font-bold text-foreground">{avgRating.toFixed(1)}</span>
            </div>
            <p className="text-sm text-muted-foreground">{feedbacks.length} review{feedbacks.length !== 1 ? "s" : ""}</p>
          </div>

          <div className="space-y-4">
            {feedbacks.map((f) => (
              <div
                key={f.id}
                className={`glass-card rounded-xl p-4 border ${f.is_testimonial ? "border-primary/30" : "border-border"}`}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${f.doctor_rating >= n ? "fill-amber-400 text-amber-500" : "text-muted-foreground/30"}`}
                      />
                    ))}
                  </div>
                  {f.clinic_rating != null && f.clinic_rating > 0 && (
                    <span className="text-xs text-muted-foreground">Clinic: {f.clinic_rating}/5</span>
                  )}
                  {f.is_testimonial && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      <Quote className="w-3 h-3" /> Testimonial
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {format(new Date(f.created_at), "MMM d, yyyy")}
                  </span>
                </div>
                {f.review_text && (
                  <p className="text-sm text-foreground mb-2 whitespace-pre-wrap">{f.review_text}</p>
                )}
                {(f.video_path || f.video_url) && (
                  f.video_path ? (
                    <button
                      type="button"
                      onClick={() => playVideo(f.id)}
                      disabled={videoLoading}
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Video className="w-4 h-4" /> {videoLoading ? "Loading…" : "Play video testimonial"}
                    </button>
                  ) : (
                    <a
                      href={f.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <Video className="w-4 h-4" /> Watch video testimonial
                    </a>
                  )
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {videoUrl && (
        <div className="fixed inset-0 bg-foreground/50 z-50 flex items-center justify-center p-4" onClick={closeVideo}>
          <div className="bg-card rounded-xl overflow-hidden max-w-2xl w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end p-2">
              <button type="button" onClick={closeVideo} className="p-1 rounded hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>
            <video src={videoUrl} controls autoPlay className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorFeedback;
