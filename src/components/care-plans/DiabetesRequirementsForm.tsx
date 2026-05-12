import { Input } from "@/components/ui/input";

// ─── Data shape ────────────────────────────────────────────────────────────

export interface DiabetesFormData {
  // Section A — Plan Overview
  patient_profile: string;
  diabetes_type: string[]; // Type 1, Type 2, Pre-diabetic, All

  // Section B — Monitoring Requirements
  bg_monitoring: string[]; // e.g. "Fasting", "Post-meal — Breakfast", etc.
  additional_vitals: string[];
  vitals_other: string;
  fasting_glucose_min: string;
  fasting_glucose_max: string;
  postmeal_glucose_min: string;
  postmeal_glucose_max: string;
  hba1c_target: string;

  // Section C — Lab Tests & Screenings
  lab_hba1c: boolean;         lab_hba1c_timing: string;
  lab_kidney: boolean;        lab_kidney_timing: string;
  lab_lipid: boolean;         lab_lipid_timing: string;
  lab_retinopathy: boolean;   lab_retinopathy_timing: string;
  lab_neuropathy: boolean;    lab_neuropathy_timing: string;
  lab_cardiovascular: boolean; lab_cardiovascular_timing: string;
  lab_foot: boolean;          lab_foot_timing: string;
  lab_followup: boolean;      lab_followup_timing: string;
  lab_other: boolean;         lab_other_name: string; lab_other_timing: string;

  pre_appt: string; // "standard" | "specify" | "no" | ""
  pre_appt_specify: string;

  // Section D — Nutritional Guidelines
  nutrition_approach: string; // "standard" | "specified" | ""
  priorities: string;
  restrictions: string;
  caloric_targets: string;

  // Section E — Activity Guidelines
  activity_approach: string; // "standard" | "specified" | ""
  activity_type: string;
  activity_restrictions: string;

  // Section F — Additional Notes
  complications: string;
  patient_considerations: string;
}

export function defaultDiabetesFormData(): DiabetesFormData {
  return {
    patient_profile: "",
    diabetes_type: [],
    bg_monitoring: [],
    additional_vitals: [],
    vitals_other: "",
    fasting_glucose_min: "",
    fasting_glucose_max: "",
    postmeal_glucose_min: "",
    postmeal_glucose_max: "",
    hba1c_target: "",
    lab_hba1c: false,        lab_hba1c_timing: "",
    lab_kidney: false,       lab_kidney_timing: "",
    lab_lipid: false,        lab_lipid_timing: "",
    lab_retinopathy: false,  lab_retinopathy_timing: "",
    lab_neuropathy: false,   lab_neuropathy_timing: "",
    lab_cardiovascular: false, lab_cardiovascular_timing: "",
    lab_foot: false,         lab_foot_timing: "",
    lab_followup: false,     lab_followup_timing: "",
    lab_other: false,        lab_other_name: "", lab_other_timing: "",
    pre_appt: "",
    pre_appt_specify: "",
    nutrition_approach: "",
    priorities: "",
    restrictions: "",
    caloric_targets: "",
    activity_approach: "",
    activity_type: "",
    activity_restrictions: "",
    complications: "",
    patient_considerations: "",
  };
}

// ─── Micro-components ─────────────────────────────────────────────────────

function SectionHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <div className="flex items-center gap-2 bg-emerald-700 text-white px-4 py-2.5 rounded-lg">
      <span className="text-xs font-black tracking-widest">{letter} —</span>
      <span className="text-sm font-black tracking-wide">{title}</span>
    </div>
  );
}

function CB({
  label, checked, onChange,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 accent-emerald-600 cursor-pointer"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function RB({
  label, value, current, onChange,
}: {
  label: string; value: string; current: string; onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none">
      <input
        type="radio"
        checked={current === value}
        onChange={() => onChange(value)}
        className="w-4 h-4 accent-emerald-600 cursor-pointer"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold text-slate-700 mb-1.5">{children}</p>;
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 italic mb-3">{children}</p>;
}

// ─── Lab test table row ────────────────────────────────────────────────────

function LabRow({
  label, checked, timing, onCheck, onTiming, extraName, onName,
}: {
  label: string;
  checked: boolean;
  timing: string;
  onCheck: (v: boolean) => void;
  onTiming: (v: string) => void;
  extraName?: string;
  onName?: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 border-b border-slate-100 last:border-b-0">
      <div className="text-sm text-slate-700">
        {extraName !== undefined ? (
          <Input
            value={extraName}
            onChange={e => onName?.(e.target.value)}
            placeholder="Other (specify)"
            className="h-8 text-sm"
          />
        ) : (
          label
        )}
      </div>
      <div className="flex flex-col gap-1 items-start min-w-[80px]">
        <CB label="Yes" checked={checked} onChange={onCheck} />
        <CB label="No" checked={!checked} onChange={v => onCheck(!v)} />
      </div>
      <Input
        value={timing}
        onChange={e => onTiming(e.target.value)}
        placeholder="e.g. Week 4, Day 30…"
        className="h-8 text-sm"
        disabled={!checked}
      />
    </div>
  );
}

// ─── Main form component ───────────────────────────────────────────────────

export default function DiabetesRequirementsForm({
  data,
  onChange,
}: {
  data: DiabetesFormData;
  onChange: (updated: DiabetesFormData) => void;
}) {
  const set = <K extends keyof DiabetesFormData>(k: K, v: DiabetesFormData[K]) =>
    onChange({ ...data, [k]: v });

  const toggleArr = (key: "diabetes_type" | "bg_monitoring" | "additional_vitals", val: string) => {
    const arr = data[key] as string[];
    set(key, arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  return (
    <div className="space-y-8">

      {/* ── A: Plan Overview ── */}
      <div className="space-y-4">
        <SectionHeader letter="A" title="PLAN OVERVIEW" />
        <div>
          <FieldLabel>
            Intended Patient Profile{" "}
            <span className="text-slate-400 font-normal text-xs ml-1">
              (e.g. newly diagnosed Type 2, insulin-dependent, post-complication management)
            </span>
          </FieldLabel>
          <Input
            value={data.patient_profile}
            onChange={e => set("patient_profile", e.target.value)}
            placeholder="Describe the intended patient…"
          />
        </div>
        <div>
          <FieldLabel>Diabetes Type this Plan Covers:</FieldLabel>
          <div className="space-y-2">
            {(["Type 1", "Type 2", "Pre-diabetic", "All"] as const).map(t => (
              <CB
                key={t}
                label={t}
                checked={data.diabetes_type.includes(t)}
                onChange={() => toggleArr("diabetes_type", t)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── B: Monitoring Requirements ── */}
      <div className="space-y-5">
        <SectionHeader letter="B" title="MONITORING REQUIREMENTS" />

        <div>
          <FieldLabel className="text-emerald-700">Blood Glucose Monitoring</FieldLabel>
          <div className="space-y-2 mt-2">
            {[
              "Fasting (morning, before food)",
              "Post-meal — Breakfast",
              "Post-meal — Lunch",
              "Post-meal — Dinner",
              "Both fasting and post-meal",
            ].map(v => (
              <CB
                key={v}
                label={v}
                checked={data.bg_monitoring.includes(v)}
                onChange={() => toggleArr("bg_monitoring", v)}
              />
            ))}
          </div>
        </div>

        <div>
          <FieldLabel className="text-emerald-700">Additional Vitals</FieldLabel>
          <div className="space-y-2 mt-2">
            {["Blood Pressure", "Weight"].map(v => (
              <CB
                key={v}
                label={v}
                checked={data.additional_vitals.includes(v)}
                onChange={() => toggleArr("additional_vitals", v)}
              />
            ))}
            <div className="flex items-center gap-2">
              <CB
                label="Other:"
                checked={data.additional_vitals.includes("Other")}
                onChange={() => toggleArr("additional_vitals", "Other")}
              />
              <Input
                value={data.vitals_other}
                onChange={e => set("vitals_other", e.target.value)}
                placeholder="Specify…"
                className="h-7 text-sm w-48"
                disabled={!data.additional_vitals.includes("Other")}
              />
            </div>
          </div>
        </div>

        <div>
          <FieldLabel className="text-emerald-700">Target Ranges</FieldLabel>
          <div className="space-y-3 mt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-600 w-64">Fasting Glucose Target (mg/dL):</span>
              <Input value={data.fasting_glucose_min} onChange={e => set("fasting_glucose_min", e.target.value)} placeholder="Min" className="h-8 w-24 text-sm" />
              <span className="text-sm text-slate-500">to</span>
              <Input value={data.fasting_glucose_max} onChange={e => set("fasting_glucose_max", e.target.value)} placeholder="Max" className="h-8 w-24 text-sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-600 w-64">Post-meal Glucose Target (mg/dL):</span>
              <Input value={data.postmeal_glucose_min} onChange={e => set("postmeal_glucose_min", e.target.value)} placeholder="Min" className="h-8 w-24 text-sm" />
              <span className="text-sm text-slate-500">to</span>
              <Input value={data.postmeal_glucose_max} onChange={e => set("postmeal_glucose_max", e.target.value)} placeholder="Max" className="h-8 w-24 text-sm" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-slate-600 w-64">HbA1c Target (%):</span>
              <Input value={data.hba1c_target} onChange={e => set("hba1c_target", e.target.value)} placeholder="e.g. 7" className="h-8 w-24 text-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* ── C: Lab Tests & Screenings ── */}
      <div className="space-y-4">
        <SectionHeader letter="C" title="LAB TESTS & SCREENINGS (SPECIAL DAYS)" />
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-600 italic">
            Special days are scheduled events that require the patient to take action beyond their daily routine — a lab test,
            a clinical screening, or a doctor's appointment. They are set by the physician's requirements and the patient is
            given flexibility to choose the date and provider.
          </p>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-3 px-4 py-2.5 bg-emerald-50 border-b border-slate-200">
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wide">Test / Screening</span>
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wide min-w-[80px]">Include</span>
            <span className="text-xs font-black text-emerald-800 uppercase tracking-wide">Preferred Timing</span>
          </div>
          <div className="px-4">
            <LabRow label="HbA1c Blood Test" checked={data.lab_hba1c} timing={data.lab_hba1c_timing}
              onCheck={v => set("lab_hba1c", v)} onTiming={v => set("lab_hba1c_timing", v)} />
            <LabRow label="Kidney Function Panel (Creatinine + Urine Microalbumin)" checked={data.lab_kidney} timing={data.lab_kidney_timing}
              onCheck={v => set("lab_kidney", v)} onTiming={v => set("lab_kidney_timing", v)} />
            <LabRow label="Lipid Profile" checked={data.lab_lipid} timing={data.lab_lipid_timing}
              onCheck={v => set("lab_lipid", v)} onTiming={v => set("lab_lipid_timing", v)} />
            <LabRow label="Diabetic Retinopathy Screening" checked={data.lab_retinopathy} timing={data.lab_retinopathy_timing}
              onCheck={v => set("lab_retinopathy", v)} onTiming={v => set("lab_retinopathy_timing", v)} />
            <LabRow label="Peripheral Neuropathy Assessment" checked={data.lab_neuropathy} timing={data.lab_neuropathy_timing}
              onCheck={v => set("lab_neuropathy", v)} onTiming={v => set("lab_neuropathy_timing", v)} />
            <LabRow label="Cardiovascular Risk Check" checked={data.lab_cardiovascular} timing={data.lab_cardiovascular_timing}
              onCheck={v => set("lab_cardiovascular", v)} onTiming={v => set("lab_cardiovascular_timing", v)} />
            <LabRow label="Foot Examination" checked={data.lab_foot} timing={data.lab_foot_timing}
              onCheck={v => set("lab_foot", v)} onTiming={v => set("lab_foot_timing", v)} />
            <LabRow label="Follow-up Appointment with Physician" checked={data.lab_followup} timing={data.lab_followup_timing}
              onCheck={v => set("lab_followup", v)} onTiming={v => set("lab_followup_timing", v)} />
            <LabRow
              label=""
              extraName={data.lab_other_name}
              onName={v => set("lab_other_name", v)}
              checked={data.lab_other}
              timing={data.lab_other_timing}
              onCheck={v => set("lab_other", v)}
              onTiming={v => set("lab_other_timing", v)}
            />
          </div>
        </div>

        <div>
          <FieldLabel className="text-emerald-700">Pre-Appointment Investigations</FieldLabel>
          <SubLabel>Should Mediimate recommend relevant lab work ahead of the follow-up appointment?</SubLabel>
          <div className="space-y-2">
            <RB
              label="Yes — standard (HbA1c, kidney panel, lipid profile as applicable)"
              value="standard"
              current={data.pre_appt}
              onChange={v => set("pre_appt", v)}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <RB label="Yes — specify:" value="specify" current={data.pre_appt} onChange={v => set("pre_appt", v)} />
              <Input
                value={data.pre_appt_specify}
                onChange={e => set("pre_appt_specify", e.target.value)}
                placeholder="List specific tests…"
                className="h-8 text-sm w-64"
                disabled={data.pre_appt !== "specify"}
              />
            </div>
            <RB label="No" value="no" current={data.pre_appt} onChange={v => set("pre_appt", v)} />
          </div>
        </div>
      </div>

      {/* ── D: Nutritional Guidelines ── */}
      <div className="space-y-4">
        <SectionHeader letter="D" title="NUTRITIONAL GUIDELINES" />
        <SubLabel>Mediimate coaches patients conversationally, not clinically. Specify priorities you want the coaching to follow.</SubLabel>

        <div>
          <FieldLabel className="text-emerald-700">General Approach</FieldLabel>
          <div className="space-y-2 mt-1">
            <RB label="Standard diabetic diet coaching" value="standard" current={data.nutrition_approach} onChange={v => set("nutrition_approach", v)} />
            <RB label="Doctor-specified guidelines below" value="specified" current={data.nutrition_approach} onChange={v => set("nutrition_approach", v)} />
          </div>
        </div>

        <div>
          <FieldLabel>
            Priorities to Emphasise{" "}
            <span className="text-slate-400 font-normal text-xs">(e.g. reduce white rice, increase fibre, portion control)</span>
          </FieldLabel>
          <textarea
            value={data.priorities}
            onChange={e => set("priorities", e.target.value)}
            rows={2}
            placeholder="Enter priorities…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <FieldLabel>
            Restrictions to Enforce{" "}
            <span className="text-slate-400 font-normal text-xs">(e.g. no refined carbs, avoid specific foods)</span>
          </FieldLabel>
          <textarea
            value={data.restrictions}
            onChange={e => set("restrictions", e.target.value)}
            rows={2}
            placeholder="Enter restrictions…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <FieldLabel>Caloric or Meal-size Targets (if any):</FieldLabel>
          <Input
            value={data.caloric_targets}
            onChange={e => set("caloric_targets", e.target.value)}
            placeholder="e.g. 1800 kcal/day, 3 meals + 1 snack…"
          />
        </div>
      </div>

      {/* ── E: Activity Guidelines ── */}
      <div className="space-y-4">
        <SectionHeader letter="E" title="ACTIVITY GUIDELINES" />

        <div>
          <FieldLabel className="text-emerald-700">General Approach</FieldLabel>
          <div className="space-y-2 mt-1">
            <RB label="Standard recommendations" value="standard" current={data.activity_approach} onChange={v => set("activity_approach", v)} />
            <RB label="Doctor-specified below" value="specified" current={data.activity_approach} onChange={v => set("activity_approach", v)} />
          </div>
        </div>

        <div>
          <FieldLabel>Activity Type and Frequency Recommended for this Patient Profile:</FieldLabel>
          <textarea
            value={data.activity_type}
            onChange={e => set("activity_type", e.target.value)}
            rows={2}
            placeholder="e.g. 30 min brisk walking 5×/week, light yoga…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <FieldLabel>
            Restrictions{" "}
            <span className="text-slate-400 font-normal text-xs">(e.g. avoid high-impact, no exercise if glucose below X)</span>
          </FieldLabel>
          <textarea
            value={data.activity_restrictions}
            onChange={e => set("activity_restrictions", e.target.value)}
            rows={2}
            placeholder="Enter any activity restrictions…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* ── F: Additional Notes ── */}
      <div className="space-y-4">
        <SectionHeader letter="F" title="ADDITIONAL NOTES" />

        <div>
          <FieldLabel>Complication Focus Areas for this Plan (if any):</FieldLabel>
          <textarea
            value={data.complications}
            onChange={e => set("complications", e.target.value)}
            rows={2}
            placeholder="e.g. Nephropathy screening, foot care education…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div>
          <FieldLabel>Specific Patient Considerations the Mediimate Team Should Account For:</FieldLabel>
          <textarea
            value={data.patient_considerations}
            onChange={e => set("patient_considerations", e.target.value)}
            rows={3}
            placeholder="e.g. patient is vegetarian, works night shifts, has mobility limitations…"
            className="w-full border border-input rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>
    </div>
  );
}
