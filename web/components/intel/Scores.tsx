import { confidenceClass, confidenceLabel, importanceTier, pct } from "@/lib/format";

/**
 * Compact numeric readouts for importance (0–100) and confidence (0–1). Tabular
 * figures, no glow — these should read like instrument panels, not badges.
 */
export function ImportanceMeter({ score, compact = false }: { score: number; compact?: boolean }) {
  const tier = importanceTier(score);
  return (
    <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`} title={`Importance ${score.toFixed(0)}/100 — ${tier}`}>
      <span className="font-mono tabular-nums text-zinc-100">{score.toFixed(0)}</span>
      <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
        <span className="block h-full bg-zinc-200" style={{ width: `${Math.max(3, Math.min(100, score))}%` }} />
      </span>
      {!compact && <span className="text-zinc-500">{tier}</span>}
    </div>
  );
}

export function ConfidenceMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "text-xs" : "text-sm"}`} title={`Confidence ${pct(value)}`}>
      <span className={`font-mono tabular-nums ${confidenceClass(value)}`}>{pct(value)}</span>
      {!compact && <span className="text-zinc-500">{confidenceLabel(value)} confidence</span>}
    </div>
  );
}

export function Tag({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" | "good" | "bad" }) {
  const cls = {
    neutral: "bg-white/5 text-zinc-300 ring-white/10",
    warn: "bg-amber-500/10 text-amber-300 ring-amber-400/20",
    good: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20",
    bad: "bg-rose-500/10 text-rose-300 ring-rose-400/20",
  }[tone];
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ${cls}`}>{children}</span>;
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{children}</h2>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </div>
  );
}
