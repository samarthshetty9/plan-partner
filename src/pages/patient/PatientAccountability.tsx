import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Eye, Users, MessageSquare, Plus, Trash2, Loader2 } from "lucide-react";

type FamilyConn = { id: string; relationship: string; invite_email: string | null; invite_phone?: string | null; phone_number?: string | null; status: string; family_user_id: string | null; access_vitals?: boolean; access_chat?: boolean; access_meds?: boolean };
type DoctorMsg = { id: string; message: string; created_at: string; doctor_name?: string };

export default function PatientAccountability() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [inviteType, setInviteType] = useState<"email" | "phone">("email");
  const [inviteValue, setInviteValue] = useState("");
  const [inviteRelationship, setInviteRelationship] = useState<"son" | "daughter" | "spouse" | "other">("other");
  const [adding, setAdding] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["me", "accountability"],
    queryFn: () =>
      api.get<{
        doctor_can_see_logs: boolean;
        doctor_name: string | null;
        family_connections: FamilyConn[];
        doctor_messages: DoctorMsg[];
      }>("me/accountability"),
  });

  const doctor_can_see_logs = data?.doctor_can_see_logs ?? false;
  const doctor_name = data?.doctor_name ?? null;
  const family_connections = data?.family_connections ?? [];
  const doctor_messages = data?.doctor_messages ?? [];

  const handleAddFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = inviteValue.trim();
    if (!value) {
      toast({ title: inviteType === "email" ? "Enter email address" : "Enter WhatsApp number", variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      if (inviteType === "email") {
        await api.post("me/family-connections", { invite_email: value.toLowerCase(), relationship: inviteRelationship });
      } else {
        await api.post("me/family-connections", { invite_phone: value, relationship: inviteRelationship });
      }
      toast({
        title: "Invitation added",
        description: inviteType === "email"
          ? "When they sign up with this email as Family, they'll see your daily log status."
          : "When they sign up with this phone number as Family, they'll see your daily log status."
      });
      setInviteValue("");
      queryClient.invalidateQueries({ queryKey: ["me", "accountability"] });
    } catch (err: unknown) {
      toast({ title: "Failed", description: err instanceof Error ? err.message : "Could not add", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveFamily = async (id: string) => {
    try {
      await api.delete(`me/family-connections/${id}`);
      queryClient.invalidateQueries({ queryKey: ["me", "accountability"] });
      toast({ title: "Removed" });
    } catch {
      toast({ title: "Could not remove", variant: "destructive" });
    }
  };

  const handleUpdateAccess = async (id: string, field: "access_vitals" | "access_chat" | "access_meds", value: boolean) => {
    try {
      await api.patch(`me/family-connections/${id}`, { [field]: value });
      queryClient.invalidateQueries({ queryKey: ["me", "accountability"] });
      toast({ title: "Access updated" });
    } catch {
      toast({ title: "Failed to update access", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="w-full sm:max-w-2xl sm:mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-heading font-semibold text-foreground">Accountability & visibility</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Who can see your health activity</p>
      </div>

      {/* Feature 1: Doctor visibility */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-semibold text-foreground">Your doctor can see your health logs</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {doctor_can_see_logs
                ? doctor_name
                  ? `${doctor_name} can see your vitals, food logs, and medication. Even passive monitoring increases compliance.`
                  : "Your care team can see your vitals, food logs, and medication."
                : "Connect to a doctor from Connect to doctor to share your logs with them."}
            </p>
          </div>
        </div>
      </section>

      {/* Feature 3: Doctor messages */}
      {doctor_messages.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-primary" />
            Messages from your doctor
          </h2>
          <ul className="space-y-3">
            {doctor_messages.slice(0, 5).map((msg) => (
              <li key={msg.id} className="rounded-xl bg-muted/50 border border-border/50 px-4 py-3">
                {msg.doctor_name && (
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">{msg.doctor_name} requested</p>
                )}
                <p className="text-sm text-foreground">{msg.message}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Feature 2: Family visibility */}
      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2 mb-2">
          <Users className="w-5 h-5 text-primary" />
          Family visibility
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Add family members by email or WhatsApp phone number. Once they sign up as &quot;Family&quot;, they can see whether you logged BP, Food, Sugar, and Medication today.
        </p>

        {/* Email vs Phone Toggle */}
        <div className="flex gap-1.5 mb-3.5 bg-muted/60 p-1 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => { setInviteType("email"); setInviteValue(""); }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${inviteType === "email" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Email
          </button>
          <button
            type="button"
            onClick={() => { setInviteType("phone"); setInviteValue(""); }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${inviteType === "phone" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            WhatsApp (Phone)
          </button>
        </div>

        <form onSubmit={handleAddFamily} className="flex flex-wrap gap-2 mb-4">
          <input
            type={inviteType === "email" ? "email" : "tel"}
            value={inviteValue}
            onChange={(e) => setInviteValue(e.target.value)}
            placeholder={inviteType === "email" ? "family@example.com" : "+91 98765 43210"}
            className="flex-1 min-w-[180px] px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <select
            value={inviteRelationship}
            onChange={(e) => setInviteRelationship(e.target.value as typeof inviteRelationship)}
            className="px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="son">Son</option>
            <option value="daughter">Daughter</option>
            <option value="spouse">Spouse</option>
            <option value="other">Other</option>
          </select>
          <button
            type="submit"
            disabled={adding}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </button>
        </form>

        {family_connections.length > 0 ? (
          <ul className="space-y-2">
            {family_connections.map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-foreground capitalize">{c.relationship}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {c.invite_email || c.invite_phone || c.phone_number || "—"}
                      </span>
                      {c.invite_email && (c.invite_phone || c.phone_number) && (
                        <>
                          <span className="text-xs text-muted-foreground/50">•</span>
                          <span className="text-xs text-muted-foreground">{c.invite_phone || c.phone_number}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded-full">{c.status}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFamily(c.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
                      aria-label="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Granular Access Controls */}
                <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border/50">
                  <span className="text-xs font-medium text-muted-foreground">Can view:</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={c.access_vitals ?? true}
                      onChange={(e) => handleUpdateAccess(c.id, "access_vitals", e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs text-foreground select-none">Vitals</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={c.access_meds ?? true}
                      onChange={(e) => handleUpdateAccess(c.id, "access_meds", e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs text-foreground select-none">Medications</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={c.access_chat ?? false}
                      onChange={(e) => handleUpdateAccess(c.id, "access_chat", e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs text-foreground select-none">Chat/Messages</span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No family members added yet.</p>
        )}
      </section>
    </div>
  );
}
