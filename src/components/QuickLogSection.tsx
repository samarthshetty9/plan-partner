import { Activity, Droplets, UtensilsCrossed, Pill } from "lucide-react";

const BP_PRESETS = ["120/80", "130/85", "140/90", "125/80", "135/85"];
const SUGAR_PRESETS = [80, 100, 120, 140, 90];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export type QuickLogLast = {
  blood_pressure: { value_text: string; recorded_at: string } | null;
  blood_sugar: { value_text: string; recorded_at: string } | null;
  food: { meal_type: string; logged_at: string } | null;
  medication: { taken: boolean; logged_at: string } | null;
};

export const MEAL_OPTIONS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
] as const;

export { BP_PRESETS, SUGAR_PRESETS, getGreeting };

export function QuickLogCards({
  patientName,
  onLogBP,
  onLogSugar,
  onLogFood,
  onLogMedication,
  compact = false,
}: {
  patientName: string;
  onLogBP: () => void;
  onLogSugar: () => void;
  onLogFood: () => void;
  onLogMedication: () => void;
  /** When true, only render the 4-button grid (no greeting/subtitle). */
  compact?: boolean;
}) {
  const greeting = getGreeting();
  const firstName = patientName?.split(" ")[0] || "";

  const cards = [
    { label: "Log BP", icon: Activity, onClick: onLogBP, color: "bg-primary/10 text-primary border-primary/20" },
    { label: "Log Sugar", icon: Droplets, onClick: onLogSugar, color: "bg-accent/10 text-accent border-accent/20" },
    { label: "Log Food", icon: UtensilsCrossed, onClick: onLogFood, color: "bg-whatsapp/10 text-whatsapp border-whatsapp/20" },
    { label: "Medication Taken", icon: Pill, onClick: onLogMedication, color: "bg-violet-500/10 text-violet-600 border-violet-500/20" },
  ];

  const grid = (
    <div className="grid grid-cols-2 gap-2 sm:gap-3 w-full">
      {cards.map(({ label, icon: Icon, onClick, color }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className={`flex items-center gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl border-2 ${color} hover:opacity-90 active:scale-[0.98] transition-all text-left touch-manipulation min-h-[52px] sm:min-h-[56px]`}
        >
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
          <span className="font-semibold text-xs sm:text-sm md:text-base truncate">{label}</span>
        </button>
      ))}
    </div>
  );

  if (compact) return grid;

  return (
    <div className="w-full max-w-3xl mx-auto mb-6 sm:mb-8">
      <h1 className="text-xl sm:text-2xl md:text-3xl font-heading font-light text-foreground mb-1">
        {greeting}{firstName ? ` ${firstName}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground mb-4 sm:mb-5">Log today&apos;s health</p>
      {grid}
    </div>
  );
}
