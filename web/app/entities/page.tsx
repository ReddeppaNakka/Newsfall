import Link from "next/link";
import { listEntities } from "@/lib/intelligence";
import { ENTITY_TYPE_LABEL } from "@/lib/format";
import type { EntityType } from "@/lib/intelligence-types";

export const revalidate = 60;

export const metadata = {
  title: "Entities — Newsfall",
  description: "People, companies, technologies and organizations tracked by Newsfall, ranked by evidence-based influence.",
};

const TYPES: EntityType[] = ["PERSON", "COMPANY", "STARTUP", "INVESTOR", "TECHNOLOGY", "PRODUCT", "RESEARCH_LAB", "GOVERNMENT", "ORGANIZATION"];

export default async function EntitiesPage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const { type, q } = await searchParams;
  const entities = await listEntities({ type: type || undefined, q: q || undefined, limit: 120 });

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">← Back to Newsfall</Link>
      <header className="mb-6 mt-5 sm:mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Knowledge layer</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">Entities</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-zinc-400">People, companies, technologies and institutions — ranked by influence computed from the events, mentions and relationships in the evidence base.</p>
      </header>

      <form className="mb-4" action="/entities">
        {type && <input type="hidden" name="type" value={type} />}
        <input name="q" defaultValue={q ?? ""} placeholder="Search entities…" className="glass w-full rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none sm:max-w-md" />
      </form>
      <div className="no-scrollbar mb-8 flex gap-2 overflow-x-auto pb-1">
        <Chip href="/entities" active={!type} label="All" />
        {TYPES.map((t) => <Chip key={t} href={`/entities?type=${t}`} active={type === t} label={ENTITY_TYPE_LABEL[t]} />)}
      </div>

      {entities.length === 0 ? (
        <p className="text-sm text-zinc-500">No entities yet — they appear once the intelligence pipeline has run.</p>
      ) : (
        <ul className="glass divide-y divide-white/5 rounded-2xl">
          {entities.map((e, i) => (
            <li key={e.id}>
              <Link href={`/entities/${e.slug}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-white/[0.04] sm:px-5">
                <span className="w-6 shrink-0 font-mono text-xs text-zinc-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{e.name}</p>
                  <p className="truncate text-xs text-zinc-500">{ENTITY_TYPE_LABEL[e.entity_type]}{e.description ? ` · ${e.description}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-mono text-sm tabular-nums text-zinc-100">{Number(e.influence_score).toFixed(0)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-zinc-600">influence</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-200"}`}>{label}</Link>
  );
}
