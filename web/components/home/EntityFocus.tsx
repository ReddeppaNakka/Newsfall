import Link from "next/link";
import type { Entity } from "@/lib/intelligence-types";
import { ENTITY_TYPE_LABEL } from "@/lib/format";
import { logoFor } from "@/lib/logo";
import SectionHeading from "./SectionHeading";

const TONES = ["#a78bfa", "#34d399", "#fb923c", "#f87171", "#60a5fa"];

/** ENTITIES IN FOCUS — mark, name, type, influence score, real mention-trend sparkline. */
export default function EntityFocus({ entities }: { entities: (Entity & { spark: number[] })[] }) {
  if (!entities.length) return null;
  return (
    <section className="px-6 sm:px-10">
      <SectionHeading title="ENTITIES IN FOCUS" icon={<NodesIcon />} action={{ label: "Explore all entities", href: "/entities" }} />
      <div className="no-scrollbar -mx-6 flex snap-x gap-3 overflow-x-auto px-6 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {entities.map((e, i) => (
          <Link
            key={e.id}
            href={`/entities/${e.slug}`}
            className="group w-[58vw] shrink-0 snap-start rounded-lg border border-white/[0.07] bg-surface p-4 transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 sm:w-auto"
          >
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoFor(e.image_url, e.official_url, e.name) ?? ""} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 rounded-md bg-white/10 object-contain p-1 ring-1 ring-white/10" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-medium text-zinc-50">{e.name}</p>
                <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-500">{ENTITY_TYPE_LABEL[e.entity_type].toUpperCase()}</p>
              </div>
            </div>
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] tracking-[0.06em] text-zinc-500">Influence Score</p>
                <p className="mt-1 font-sans text-[26px] font-medium leading-none tabular-nums text-zinc-50">{Math.round(Number(e.influence_score))}</p>
              </div>
              <Sparkline data={e.spark} color={TONES[i % TONES.length]} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 96, h = 30;
  if (!data.length) return <span className="h-[30px] w-[96px]" />;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - 3 - (v / max) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const id = `sp-${color.slice(1)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-label="Mentions over the last 14 days" role="img">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.25" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function NodesIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6h7M6 8.5v7M18 8.5v7M8.5 18h7" />
    </svg>
  );
}
