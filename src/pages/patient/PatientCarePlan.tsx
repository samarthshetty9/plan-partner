import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { HeartPulse, ArrowLeft, Trophy, Info, Flame, ChevronRight, Calendar, Zap, Users, TrendingUp, Sparkles, Activity } from "lucide-react";
import { Link } from "react-router-dom";
import { TierProgressBar } from "@/components/care-plans/TierProgressBar";
import { DayTimeline } from "@/components/care-plans/DayTimeline";
import { DashboardVitalsHub } from "@/components/care-plans/DashboardVitalsHub";
import { TaskChecklist } from "@/components/care-plans/TaskChecklist";
import { VoiceInteractionButton } from "@/components/care-plans/VoiceInteractionButton";
import { ComplicationTiles } from "@/components/care-plans/ComplicationTiles";
import { MHPRewardPanel } from "@/components/care-plans/MHPRewardPanel";
import { 
  LeaderboardCard, 
  WeeklyPodium, 
  ActivityFeed, 
  MyPositionBanner, 
  BatchMomentum 
} from "@/components/care-plans/LeaderboardComponents";

type PlanSummary = {
  assignment_id: string;
  careplan_id: string;
  name: string;
  description: string;
  cover_color: string;
  duration_days: number;
  current_day: number;
  mhp_balance: number;
  mhp_tier: string;
  streak_days: number;
  days_logged: number;
  status: string;
};

type CarePlanData = {
  assignment: any;
  careplan: any;
  today_tasks: any;
  current_week: number;
  week_theme: any;
  medications_status: { medicine: string; status: string }[];
};

// Top navigation Badge for MHP
function TopMhpPill({ balance, tier }: { balance: number; tier: string }) {
  const colours: Record<string, string> = {
    Gold: "from-amber-400 to-yellow-300 text-amber-900 ring-amber-300",
    Silver: "from-slate-300 to-slate-200 text-slate-800 ring-slate-300",
    Bronze: "from-orange-300 to-orange-200 text-orange-900 ring-orange-300",
  };
  const gradient = colours[tier] || "from-slate-100 to-white text-slate-700 ring-slate-200";

  return (
    <div className="relative group z-50">
      <div className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full bg-gradient-to-r ${gradient} ring-1 shadow-sm transition-transform hover:scale-105 cursor-pointer`}>
        <span className="text-xl md:text-2xl font-black tabular-nums tracking-tight">{balance}</span>
        <span className="text-xs font-bold uppercase tracking-wider opacity-90 mt-0.5">MHP ✨</span>
      </div>
      
      {/* Dropdown Menu */}
      <div className="absolute top-full right-0 mt-3 w-80 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 translate-y-2 group-hover:translate-y-0">
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-50" />
          <div className="flex items-center gap-3 mb-5">
            <div className={`w-12 h-12 flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} shadow-inner text-2xl`}>
              🏆
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 leading-none mb-1">Your MHP Wallet</p>
              <p className="text-[11px] text-slate-500 font-medium">Current Tier: <span className="font-bold text-slate-700">{tier || "None"}</span></p>
            </div>
          </div>
          <TierProgressBar balance={balance} tier={tier} />
        </div>
      </div>
    </div>
  );
}

// Compact Stats Grid Sidebar Component
function CompactStats({ currentDay, totalDays, streakDays, daysLogged }: any) {
  const logRate = Math.round((daysLogged / currentDay) * 100) || 0;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-4 flex flex-col items-center justify-center text-center shadow-sm">
        <Calendar className="w-4 h-4 text-blue-500 mb-1.5" />
        <p className="text-sm font-black text-blue-900">{currentDay}/{totalDays}</p>
        <p className="text-[10px] font-bold text-blue-600/70 uppercase">Day</p>
      </div>
      <div className="bg-amber-50/50 rounded-xl border border-amber-100 p-4 flex flex-col items-center justify-center text-center shadow-sm">
        <Flame className="w-4 h-4 text-amber-500 mb-1.5" />
        <p className="text-sm font-black text-amber-900">{streakDays}d</p>
        <p className="text-[10px] font-bold text-amber-600/70 uppercase">Streak</p>
      </div>
      <div className="bg-emerald-50/50 rounded-xl border border-emerald-100 p-4 flex flex-col items-center justify-center text-center shadow-sm">
        <TrendingUp className="w-4 h-4 text-emerald-500 mb-1.5" />
        <p className="text-sm font-black text-emerald-900">{logRate}%</p>
        <p className="text-[10px] font-bold text-emerald-600/70 uppercase">Log Rate</p>
      </div>
      <div className="bg-purple-50/50 rounded-xl border border-purple-100 p-4 flex flex-col items-center justify-center text-center shadow-sm">
        <HeartPulse className="w-4 h-4 text-purple-500 mb-1.5" />
        <p className="text-sm font-black text-purple-900">{daysLogged}d</p>
        <p className="text-[10px] font-bold text-purple-600/70 uppercase">Logged</p>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colours: Record<string, string> = {
    Gold: "bg-yellow-100 text-yellow-700 border-yellow-300",
    Silver: "bg-slate-100 text-slate-600 border-slate-300",
    Bronze: "bg-orange-100 text-orange-700 border-orange-300",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colours[tier] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
      {tier}
    </span>
  );
}

function PlanSelectionGrid({ plans, onSelect }: { plans: PlanSummary[]; onSelect: (id: string) => void }) {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <HeartPulse className="h-6 w-6 text-green-600" />
          <h1 className="text-xl font-heading font-semibold">My Care Plans</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="rounded-full border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 font-bold">
          <Link to="/patient/care-plan/channel" className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Explore Channel
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">You're enrolled in {plans.length} care plans. Select one to view details.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const progress = Math.round((plan.current_day / plan.duration_days) * 100);
          return (
            <button
              key={plan.assignment_id}
              onClick={() => onSelect(plan.assignment_id)}
              className="text-left rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all overflow-hidden group"
            >
              <div className="h-2 w-full" style={{ background: plan.cover_color }} />
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-semibold leading-snug">{plan.name}</h2>
                  <TierBadge tier={plan.mhp_tier} />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{plan.description}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Day {plan.current_day} / {plan.duration_days}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: plan.cover_color }} />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-amber-500" />{plan.mhp_balance} MHP</span>
                  <span className="flex items-center gap-1"><Flame className="h-3 w-3 text-orange-500" />{plan.streak_days}d streak</span>
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-blue-500" />{plan.days_logged} logged</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium" style={{ color: plan.cover_color }}>View Plan</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PatientCarePlan() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch list of all enrolled plans
  const { data: plans, isLoading: listLoading } = useQuery<PlanSummary[]>({
    queryKey: ["me", "careplans"],
    queryFn: () => api.get<PlanSummary[]>("me/careplans"),
  });

  // Auto-select if only one plan
  const effectiveId = selectedId ?? (plans?.length === 1 ? plans[0].assignment_id : null);

  // Fetch full detail for selected plan
  const { data, isLoading: detailLoading, error } = useQuery<CarePlanData>({
    queryKey: ["me", "careplan", effectiveId],
    queryFn: () => api.get<CarePlanData>(`me/careplan${effectiveId ? `?assignmentId=${effectiveId}` : ""}`),
    enabled: !!effectiveId,
  });

  // Fetch leaderboard data for dashboard integration
  const { data: lbData, isLoading: lbLoading } = useQuery<any>({
    queryKey: ["me", "careplan", "leaderboard", effectiveId],
    queryFn: () => api.get<any>(`me/careplan/${effectiveId}/leaderboard`),
    enabled: !!effectiveId,
  });

  const isLoading = listLoading || (!!effectiveId && (detailLoading || lbLoading));

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-destructive">Failed to load care plan. Please try again.</p>
      </div>
    );
  }

  if (!listLoading && plans && plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 px-6 text-center">
        <HeartPulse className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">No Active Care Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">You're not enrolled in any care plan yet.</p>
        </div>
      </div>
    );
  }

  if (plans && plans.length > 1 && !effectiveId) {
    return <PlanSelectionGrid plans={plans} onSelect={setSelectedId} />;
  }

  if (!data?.assignment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 px-6 text-center">
        <HeartPulse className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">No Active Care Plan</h2>
          <p className="text-sm text-muted-foreground mt-1">You're not enrolled in any care plan yet.</p>
        </div>
      </div>
    );
  }

  const { assignment: a, careplan: cp, today_tasks: tasks, current_week, week_theme } = data;

  const daysLogged = (a.day_logs || []).filter(
    (d: any) => d.fasting_sugar != null || d.postmeal_sugar != null || d.meds_taken
  ).length;

  return (
    <div className="space-y-6 lg:space-y-8 p-4 sm:p-6 md:p-8 max-w-[1400px] mx-auto bg-slate-50/20 min-h-screen">
      {/* Header & Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          {plans && plans.length > 1 && (
            <button onClick={() => setSelectedId(null)} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors shrink-0">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div className="flex shrink-0 items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 shadow-sm shadow-emerald-200">
            <HeartPulse className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-tight">{cp.name}</h1>
            <p className="text-xs font-medium text-slate-500 line-clamp-1">{cp.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="hidden md:flex rounded-full border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
            <Link to="/patient/care-plan/channel" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Explore Channel
            </Link>
          </Button>
          {/* Interactive Top MHP Pill */}
          <TopMhpPill balance={a.mhp_balance || 0} tier={a.mhp_tier} />
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
        
        {/* Left Column (Main Focus - 2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Week Theme Banner */}
          {week_theme && (
             <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-6 md:p-8 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none -translate-y-8 translate-x-12">
                 <Zap className="w-48 h-48" />
               </div>
               <div className="relative z-10">
                 <Badge variant="outline" className="text-emerald-50 border-emerald-400/50 text-[10px] bg-white/10 backdrop-blur-sm mb-2 uppercase tracking-wide">
                   Week {current_week}
                 </Badge>
                 <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-2 leading-tight">{week_theme.theme}</h3>
                 <p className="text-emerald-100/90 text-sm font-medium max-w-lg leading-relaxed">{week_theme.focus}</p>
               </div>
             </div>
          )}

          {/* Onboarding hint */}
          {!a.onboarding_complete && (
            <Card className="border-blue-200 bg-blue-50/80 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-900 leading-tight mb-1">Complete Your Onboarding</p>
                    <p className="text-xs font-medium text-blue-700/80 leading-relaxed">
                      Share your diabetes type, current medications, and baseline sugar readings to personalize your care plan experience.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Task Checklist (High Priority) */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
            <Card className="shadow-md border-slate-200/60 overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-500" />
                  Your Focus Today
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 relative">
                 <VoiceInteractionButton assignmentId={a.id} />
                 <TaskChecklist assignmentId={a.id} tasks={tasks} currentDay={a.current_day} medicationsStatus={data.medications_status || []} />
              </CardContent>
            </Card>
          </div>

          {/* Comprehensive Vitals Hub */}
          <DashboardVitalsHub />

          {/* Complications */}
          {a.current_day >= 5 && (
            <Card className="shadow-md border-slate-200/60">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-500" />
                  Complication Screening
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-5 bg-white">
                 <ComplicationTiles assignmentId={a.id} screened={a.complications_screened || {}} />
              </CardContent>
            </Card>
          )}

          {/* Full Rankings */}
          {lbData && (
            <Card className="shadow-md border-slate-200/60 overflow-hidden flex flex-col">
              <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
                <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-500" />
                  Program Leaderboard
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 overflow-y-auto max-h-[450px]">
                 <LeaderboardCard rankings={lbData.rankings} />
              </CardContent>
            </Card>
          )}

          {/* Rewards */}
          <Card className="shadow-md border-slate-200/60">
            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <CardTitle className="text-base font-black text-slate-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                Rewards & MHP History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
               <MHPRewardPanel
                  assignmentId={a.id}
                  balance={a.mhp_balance || 0}
                  tier={a.mhp_tier}
                  history={a.mhp_history || []}
                  rewardTiers={cp.reward_tiers || []}
                  rewardsClaimed={a.rewards_claimed}
                  rewardCoupons={a.reward_coupons}
               />
            </CardContent>
          </Card>
        </div>

        {/* Right Column (Sidebar - 1/3 width) */}
        <div className="lg:col-span-1 space-y-6">
           
           {/* My Position & Batch Momentum */}
           {lbData && (
             <div className="space-y-4">
                <MyPositionBanner
                  myRank={lbData.my_rank}
                  myMhp={lbData.my_mhp}
                  totalMembers={lbData.total_members}
                  nextAbove={lbData.next_above}
                />
                <BatchMomentum
                  loggedToday={lbData.logged_today}
                  totalMembers={lbData.total_members}
                  momentumPct={lbData.momentum_pct}
                />
             </div>
           )}
           
           {/* Compact Stats Grid */}
           <CompactStats 
             currentDay={a.current_day} 
             totalDays={cp.duration_days} 
             streakDays={a.streak_days || 0} 
             daysLogged={daysLogged} 
           />

           {/* Calendar */}
           <Card className="shadow-md border-slate-200/60 bg-white">
             <CardContent className="p-4 sm:p-5">
               <DayTimeline totalDays={cp.duration_days} currentDay={a.current_day} dayLogs={a.day_logs || []} />
             </CardContent>
           </Card>

           {/* Weekly Podium */}
           {lbData && lbData.weekly_top.length >= 3 && (
             <Card className="shadow-md border-slate-200/60 bg-slate-50/50 overflow-hidden hidden sm:block">
                <CardHeader className="pb-0 pt-5">
                  <CardTitle className="text-sm font-bold text-slate-800 text-center flex items-center justify-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    Top 3 This Week
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-2 pb-5">
                   <WeeklyPodium top={lbData.weekly_top} />
                </CardContent>
             </Card>
           )}

           {/* Activity feed */}
           {lbData && lbData.activity_feed.length > 0 && (
             <Card className="shadow-md border-slate-200/60">
                <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                  <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-emerald-500" />
                    Live Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                   <ActivityFeed feed={lbData.activity_feed} />
                </CardContent>
             </Card>
           )}
        </div>

      </div>
    </div>
  );
}
