import type { Settings, Difficulty } from "@/lib/api";

const COUNTS = [["mcq", "MCQ"], ["short_answer", "Short answer"], ["true_false", "True / False"], ["fill_blank", "Fill-in-the-blank"]] as const;
const clamp = (n: number) => Math.max(0, Math.min(10, Number.isFinite(n) ? n : 0));

// Question count inputs + difficulty mix sliders.
export function SettingsForm({ value, onChange }: { value: Settings; onChange: (s: Settings) => void }) {
  const mix = value.difficulty_mix;
  const total = mix.easy + mix.medium + mix.hard;
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 font-display text-lg">Question settings</legend>
      <div className="grid grid-cols-2 gap-3">
        {COUNTS.map(([k, label]) => (
          <label key={k} className="text-sm">
            <span className="mb-1 block text-muted-foreground">{label}</span>
            <input type="number" min={0} max={10} value={value[k]} onChange={(e) => onChange({ ...value, [k]: clamp(+e.target.value) })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        ))}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Difficulty mix</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">Total: {total}</span>
        </div>
        {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
          <label key={d} className="mb-2 flex items-center gap-3 text-sm">
            <span className="w-16 capitalize">{d}</span>
            <input type="range" min={0} max={10} value={mix[d]} aria-label={`${d} questions`}
              onChange={(e) => onChange({ ...value, difficulty_mix: { ...mix, [d]: +e.target.value } })} className="flex-1 accent-primary" />
            <span className="w-6 text-right font-mono">{mix[d]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
