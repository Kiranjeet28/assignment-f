import type { Settings, Difficulty } from "@/lib/api";

const COUNTS = [["mcq", "MCQ"], ["short_answer", "Short answer"], ["true_false", "True / False"], ["fill_blank", "Fill-in-the-blank"]] as const;
const clamp = (n: number) => Math.max(0, Math.min(10, Number.isFinite(n) ? n : 0));

// Question type counts and a single difficulty mode matching the API contract.
export function SettingsForm({ value, onChange }: { value: Settings; onChange: (s: Settings) => void }) {
  const mix = value.difficulty_mix;
  const total = value.mcq + value.short_answer + value.true_false + value.fill_blank;
  const activeDifficulties = (Object.keys(mix) as Difficulty[]).filter((d) => mix[d] > 0);
  const difficulty = activeDifficulties.length === 1 ? activeDifficulties[0]! : "mixed";
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 font-display text-lg">Question settings</legend>
      <div className="grid grid-cols-2 gap-3">
        {COUNTS.map(([k, label]) => (
          <label key={k} className="text-sm">
            <span className="mb-1 block text-muted-foreground">{label}</span>
            <input type="number" min={0} max={Math.min(10, 30 - (total - value[k]) )} value={value[k]} onChange={(e) => onChange({ ...value, [k]: Math.min(Math.min(10, 30 - (total - value[k])), clamp(+e.target.value)) })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        ))}
      </div>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">Difficulty</span>
        <select value={difficulty} onChange={(e) => {
          const selected = e.target.value;
          onChange({ ...value, difficulty_mix: selected === "mixed"
            ? { easy: 1, medium: 1, hard: 1 }
            : { easy: selected === "easy" ? 1 : 0, medium: selected === "medium" ? 1 : 0, hard: selected === "hard" ? 1 : 0 } });
        }} className="w-full rounded-md border border-input bg-background px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Total requested: {total} (maximum 30). Type counts choose the total and enabled types; the API chooses the split between enabled types.</p>
    </fieldset>
  );
}
