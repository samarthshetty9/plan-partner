import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList,
  Plus,
  Users,
  Activity,
  ChevronRight,
  Loader2,
} from "lucide-react";
import CarePlanWizard from "@/components/care-plans/CarePlanWizard";

interface CarePlan {
  id: string;
  name: string;
  slug: string;
  condition: string;
  duration_days: number;
  description: string;
  cover_color: string;
  is_active: boolean;
  enrolled_count: number;
  avg_adherence: number;
}

export default function DoctorCarePlans() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"existing" | "build">("existing");

  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => { fetchPlans(); }, []);

  async function fetchPlans() {
    setLoadingPlans(true);
    try {
      const data = await api.get<CarePlan[]>("/care-plans");
      setPlans(data);
    } catch {
      toast({ title: "Failed to load care plans", variant: "destructive" });
    } finally {
      setLoadingPlans(false);
    }
  }

  const adherencePct = (n: number) => Math.round(n);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ClipboardList className="w-7 h-7 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Care Plans</h1>
          <p className="text-sm text-gray-500">Design and manage structured care programmes for your patients</p>
        </div>
      </div>

      {/* ── Existing Care Plans ── */}
      {activeTab === "existing" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-600 text-sm">{plans.length} programme{plans.length !== 1 ? "s" : ""} available</p>
            <button
              onClick={() => setActiveTab("build")}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> New Care Plan
            </button>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : plans.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No care plans yet</p>
              <p className="text-sm">Click "New Care Plan" to build your first programme with Gemini AI.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden group"
                  onClick={() => navigate(`/dashboard/care-plans/${plan.id}`)}
                >
                  <div className="h-2 w-full" style={{ backgroundColor: plan.cover_color || "#16a34a" }} />
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors line-clamp-2">
                          {plan.name}
                        </h3>
                        <span className="inline-block mt-1 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium capitalize">
                          {plan.condition}
                        </span>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-emerald-500 transition-colors flex-shrink-0 mt-1" />
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2 mb-4">{plan.description}</p>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Users className="w-4 h-4" />
                        {plan.enrolled_count ?? 0} enrolled
                      </span>
                      <span className="text-gray-500">{plan.duration_days} days</span>
                    </div>
                    {plan.enrolled_count > 0 && (
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Avg Adherence</span>
                          <span className="font-medium">{adherencePct(plan.avg_adherence ?? 0)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${adherencePct(plan.avg_adherence ?? 0)}%`, backgroundColor: plan.cover_color || "#16a34a" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── New Care Plan Wizard ── */}
      {activeTab === "build" && (
        <CarePlanWizard
          onDone={() => { fetchPlans(); setActiveTab("existing"); }}
          onCancel={() => setActiveTab("existing")}
        />
      )}
    </div>
  );
}
