import {
  Stethoscope,
  Smartphone,
  HeartPulse,
  TrendingUp,
  CalendarCheck,
  ShieldAlert,
  GraduationCap,
  ArrowRight,
  CheckCircle2,
  Star,
  Flame,
  Trophy,
} from "lucide-react";

const timeline = [
  {
    step: "1",
    icon: Stethoscope,
    color: "from-blue-500 to-blue-600",
    title: "Doctor Leads",
    subtitle: "Plan built to your specification",
    points: [
      "Doctor creates care plan: title, description, requirements form",
      "Mediimate team builds plan to specification",
      "Published under doctor's name after approval",
    ],
  },
  {
    step: "2",
    icon: Smartphone,
    color: "from-green-500 to-green-600",
    title: "Patient Starts",
    subtitle: "WhatsApp onboarding — no app needed",
    points: [
      "WhatsApp onboarding — no app needed",
      "Schedule personalised around patient's routine",
      "Family or care partner added with consent | Points: 0 MHP",
    ],
  },
  {
    step: "3",
    icon: HeartPulse,
    color: "from-red-500 to-rose-600",
    title: "Daily Support",
    subtitle: "Reminders and check-ins, every single day",
    points: [
      "Morning glucose log → points awarded",
      "Medication reminders, post-meal check, nutrition coaching",
      "Evening check-in to close the day",
    ],
  },
  {
    step: "4",
    icon: TrendingUp,
    color: "from-amber-500 to-orange-500",
    title: "Weekly Boost",
    subtitle: "Progress, leaderboard & milestone alerts",
    points: [
      "Weekly leaderboard position shared",
      "Points balance updated daily",
      "Tier milestone alert when threshold crossed",
    ],
  },
  {
    step: "5",
    icon: CalendarCheck,
    color: "from-purple-500 to-violet-600",
    title: "Monthly Check",
    subtitle: "Summary, trends & clinic-ready report",
    points: [
      "15-day summary: glucose trend, streaks, adherence rate",
      "30-day report ready for clinic visit",
      "Family or care partner updated on patient progress",
    ],
  },
  {
    step: "6",
    icon: ShieldAlert,
    color: "from-red-600 to-red-700",
    title: "Emergency Support",
    subtitle: "Instant alerts for critical readings",
    points: [
      "Critical readings → instant WhatsApp action buttons: call ambulance, call doctor, alert family",
      "Elevated readings notify care partner automatically",
      "Sustained trends flagged → doctor consultation suggested",
    ],
  },
  {
    step: "7",
    icon: GraduationCap,
    color: "from-emerald-500 to-teal-600",
    title: "Graduation",
    subtitle: "Full summary and rewards redeemable",
    points: [
      "Full programme summary delivered",
      "Points redeemable — lab tests, plan discounts, teleconsultations",
      "Report brought to clinic: complete 90-day clinical picture",
    ],
  },
];

const rewardTiers = [
  { tier: "Bronze", pts: "200 MHP", reward: "Free lab test at partner clinic + 10% off next plan", color: "from-amber-700 to-amber-800" },
  { tier: "Silver", pts: "500 MHP", reward: "Free HbA1c test + 1 free teleconsultation", color: "from-gray-400 to-gray-500" },
  { tier: "Gold", pts: "1,000 MHP", reward: "90-day plan at 50% off + Priority access", color: "from-yellow-400 to-amber-500" },
];

const ProgramPlanSection = () => (
  <section id="program" className="py-12 sm:py-24 px-4 bg-card">
    <div className="container mx-auto">
      {/* Header */}
      <div className="text-center mb-16 space-y-3">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-sm font-medium text-primary border border-primary/20">
          <CalendarCheck className="w-3.5 h-3.5" />
          92% Completion Guaranteed
        </span>
        <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-foreground">
          How we run your 90-day program
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Doctor builds once. Tech + Humans deliver daily. Real results, real rewards.
        </p>
      </div>

      {/* Care plan explainer */}
      <div className="max-w-3xl mx-auto mb-12 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-5 space-y-2">
        <h3 className="text-base font-heading font-bold text-foreground">What is a care plan?</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A care plan is a structured, personalised programme — 30, 60, or 90 days — built by your doctor
          and delivered daily on WhatsApp. Patients receive morning and evening check-ins, medication
          reminders, glucose tracking, nutrition coaching, and weekly health reports. No app download.
          No extra equipment. The doctor sets the clinical requirements once; Mediimate handles daily
          delivery and reporting.
        </p>
      </div>

      {/* Horizontal Timeline */}
      <div className="relative w-full max-w-7xl mx-auto">
        {/* Scrollable on mobile, wrapped grid on desktop */}
        <div className="flex md:grid md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-x-auto pb-4 md:pb-0 md:overflow-visible snap-x snap-mandatory scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {timeline.map((item, i) => (
            <div key={item.step} className="relative flex-shrink-0 w-[260px] sm:w-[280px] md:w-auto snap-center group">
              {/* Card content */}
              <div className="rounded-xl border border-border bg-background p-4 sm:p-5 h-full hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 relative overflow-hidden">
                {/* Top gradient accent */}
                <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color}`} />

                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center flex-shrink-0 shadow-md group-hover:scale-110 transition-transform`}>
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-primary/60 uppercase tracking-wider">Step {item.step}</span>
                      {i === timeline.length - 1 && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 font-semibold">Finish</span>}
                    </div>
                    <h3 className="text-sm font-heading font-bold text-foreground truncate">{item.title}</h3>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-2.5">{item.subtitle}</p>
                <ul className="space-y-1">
                  {item.points.map((pt, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-xs text-foreground/80">
                      <ArrowRight className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rewards & Gamification */}
      <div className="mt-20 max-w-4xl mx-auto">
        <div className="text-center mb-10 space-y-2">
          <h3 className="text-2xl sm:text-3xl font-heading font-extrabold text-foreground flex items-center justify-center gap-2">
            <Trophy className="w-7 h-7 text-amber-500" />
            Rewards & Gamification
          </h3>
          <p className="text-muted-foreground">Points that convert to real-world rewards your patients actually want.</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 mb-8">
          {/* Points system */}
          <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
            <h4 className="font-heading font-bold text-foreground flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Points System
            </h4>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Log fasting blood glucose</span><span className="font-semibold text-foreground">+10 MHP</span></div>
              <div className="flex justify-between"><span>Log post-meal blood glucose</span><span className="font-semibold text-foreground">+10 MHP</span></div>
              <div className="flex justify-between"><span>Confirm medicine taken</span><span className="font-semibold text-foreground">+5 MHP / dose</span></div>
              <div className="flex justify-between"><span>Log a meal</span><span className="font-semibold text-foreground">+5 MHP</span></div>
              <div className="flex justify-between"><span>Log workout / activity</span><span className="font-semibold text-foreground">+10 MHP</span></div>
              <div className="flex justify-between"><span>Complete complication screen</span><span className="font-semibold text-foreground">+20 MHP</span></div>
              <div className="flex justify-between"><span>Book follow-up appointment</span><span className="font-semibold text-foreground">+50 MHP</span></div>
              <div className="flex justify-between"><span>Refer a friend who joins</span><span className="font-semibold text-foreground">+100 MHP</span></div>
              <div className="flex justify-between"><span>3-day logging streak bonus</span><span className="font-semibold text-foreground">+25 MHP</span></div>
              <div className="flex justify-between"><span>7-day logging streak bonus</span><span className="font-semibold text-foreground">+75 MHP</span></div>
              <div className="flex justify-between"><span>Complete all 30 days</span><span className="font-semibold text-foreground">+200 MHP 🥇</span></div>
            </div>
          </div>

          {/* Family Dashboard */}
          <div className="rounded-2xl border border-border bg-background p-6 space-y-4">
            <h4 className="font-heading font-bold text-foreground flex items-center gap-2">
              <Flame className="w-5 h-5 text-red-500" />
              Family Dashboard
            </h4>
            <div className="rounded-xl bg-muted/50 p-4 font-mono text-sm space-y-1.5">
              <p className="text-foreground font-semibold">Abhay: 92% 🟢 | Streak 21 | Silver</p>
              <p className="text-muted-foreground text-xs">Family sees: adherence rate, streaks & weekly summary</p>
              <p className="text-muted-foreground text-xs">Missed logs → care partner nudged on WhatsApp</p>
              <p className="text-muted-foreground text-xs">Critical readings → instant family alert</p>
              <p className="text-muted-foreground text-xs">Points balance & tier progress shared</p>
            </div>
            <p className="text-xs text-muted-foreground italic">Visible to family — Indian accountability that works.</p>
          </div>
        </div>

        {/* Reward Tiers */}
        <div className="grid grid-cols-1 xs:grid-cols-3 sm:grid-cols-3 gap-3 sm:gap-4">
          {rewardTiers.map((t) => (
            <div key={t.tier} className="rounded-xl border border-border bg-background p-3 sm:p-4 text-center hover:shadow-lg transition-shadow">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 mx-auto rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center mb-2`}>
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <p className="font-heading font-bold text-foreground text-sm">{t.tier}</p>
              <p className="text-xs text-primary font-semibold">{t.pts}</p>
              <p className="text-xs text-muted-foreground mt-1">{t.reward}</p>
            </div>
          ))}
        </div>

        {/* Completion promise */}
        <div className="mt-10 rounded-2xl bg-gradient-to-br from-primary/5 to-emerald-500/5 border border-primary/20 p-6 sm:p-8">
          <h4 className="text-xl font-heading font-bold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            100% Completion Promise
          </h4>
          <p className="text-sm text-muted-foreground mb-4">We guarantee you'll finish 90 days because:</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {[
              "Daily dopamine (points + streaks)",
              "Family accountability (Indian reality)",
              "SPOC backup (human, always available)",
              "Rewards that actually matter",
              "WhatsApp forever (no app fatigue)",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {item}
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-semibold text-primary">92% of 127 patients graduated last month.</p>
        </div>
      </div>
    </div>
  </section>
);

export default ProgramPlanSection;
