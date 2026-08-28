import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getEntityBySlug, getEntityClaims, getEntityEvents, getEntityRelationships } from "@/lib/intelligence";
import { CLAIM_STATUS_CLASS, CLAIM_STATUS_LABEL, ENTITY_TYPE_LABEL, EVENT_TYPE_LABEL, formatDate, humanize, relativeTime } from "@/lib/format";
import { logoFor } from "@/lib/logo";
import EntityChip from "@/components/intel/EntityChip";
import EventCard from "@/components/intel/EventCard";
import { SectionTitle } from "@/components/intel/Scores";

export const revalidate = 60;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  const { slug } = await params;
  const e = await getEntityBySlug(slug);
  return { title: e ? `${e.name} — Newsfall` : "Entity — Newsfall", description: e?.description ?? undefined };
}

/**
 * /entities/[slug] — overview, influence, recent events, relationships (the graph, as a
 * list — a visual graph is added only where it improves understanding), claims about
 * the entity, and what to watch. TECHNOLOGY entities deep-link to the legacy /topic page.
 */
export default async function EntityPage({ params }: Params) {
  const { slug } = await params;
  const entity = await getEntityBySlug(slug);
  if (!entity) notFound();

  const [events, relationships, claims] = await Promise.all([
    getEntityEvents(entity.id, 20), getEntityRelationships(entity.id), getEntityClaims(entity.id, 12),
  ]);
  let techSlug: string | null = null;
  if (entity.technology_id) {
    try {
      const { data } = await supabase.from("technologies").select("slug").eq("id", entity.technology_id).maybeSingle();
      techSlug = (data as { slug?: string } | null)?.slug ?? null;
    } catch {
      techSlug = null;
    }
  }
  const connected = new Map<string, { entity: { id: string; slug: string; name: string; entity_type: string; influence_score: number }; via: string; direction: "out" | "in"; confidence: number }>();
  for (const r of relationships) {
    const other = r.source.id === entity.id ? r.target : r.source;
    if (!connected.has(other.id)) connected.set(other.id, { entity: other, via: r.relationship_type, direction: r.source.id === entity.id ? "out" : "in", confidence: r.confidence });
  }
  const watch = events.flatMap((e) => e.what_to_watch.map((w) => ({ w, e }))).slice(0, 6);
  const logo = logoFor(entity.image_url, entity.official_url, entity.name);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link href="/entities" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">← Entities</Link>

      <header className="glass mt-5 rounded-2xl p-5 sm:mt-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-9 w-9 object-contain" />
            ) : (
              <span className="text-2xl font-bold text-white/80">{entity.name.charAt(0)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{ENTITY_TYPE_LABEL[entity.entity_type]}</p>
            <h1 className="break-words text-2xl font-bold tracking-tight text-white sm:text-4xl">{entity.name}</h1>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl tabular-nums text-zinc-50">{Number(entity.influence_score).toFixed(0)}</div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500">influence score</div>
          </div>
        </div>
        {entity.description && <p className="mt-4 text-[15px] leading-relaxed text-zinc-300">{entity.description}</p>}
        {entity.aliases?.length > 0 && <p className="mt-2 text-xs text-zinc-500">Also known as: {entity.aliases.join(", ")}</p>}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {entity.official_url && <a href={entity.official_url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:text-white">Official site ↗</a>}
          {techSlug && <Link href={`/topic/${techSlug}`} className="text-zinc-300 hover:text-white">Technology deep-dive →</Link>}
          <Link href={`/ask?q=${encodeURIComponent(`What are the most important recent developments involving ${entity.name}?`)}`} className="text-zinc-300 hover:text-white">Ask Newsfall about {entity.name} →</Link>
          <span className="text-zinc-600">{entity.mention_count} mentions · {events.length} events · {connected.size} connections</span>
        </div>
      </header>

      {/* Intelligence summary: derived from top events */}
      {events.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Intelligence summary</SectionTitle>
          <div className="glass rounded-2xl p-5 text-sm leading-relaxed text-zinc-300">
            {events.slice(0, 3).map((e) => (
              <p key={e.id} className="mb-2 last:mb-0">
                <Link href={`/events/${e.slug}`} className="font-medium text-zinc-100 hover:underline underline-offset-4">{e.title}</Link>
                {e.why_it_matters ? ` — ${e.why_it_matters}` : e.summary ? ` — ${e.summary}` : ""}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Connections */}
      {connected.size > 0 && (
        <section className="mt-8">
          <SectionTitle hint="from evidence-stated relationships">Key relationships</SectionTitle>
          <ul className="glass divide-y divide-white/5 rounded-xl">
            {[...connected.values()].slice(0, 20).map(({ entity: other, via, direction, confidence }) => (
              <li key={other.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">{direction === "out" ? humanize(via) : `${humanize(via)} (by)`}</span>
                <EntityChip entity={other as never} />
                <span className="ml-auto font-mono text-xs text-zinc-600">{Math.round(confidence * 100)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent events */}
      {events.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Recent events</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {events.slice(0, 8).map((e) => <EventCard key={e.id} event={e} compact />)}
          </div>
        </section>
      )}

      {/* Timeline */}
      {events.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Timeline</SectionTitle>
          <ol className="relative border-l border-white/10 pl-5">
            {events.map((e) => (
              <li key={e.id} className="mb-5 last:mb-0">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-zinc-400" />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <time>{formatDate(e.occurred_at ?? e.first_seen_at)}</time>
                  <span>· {EVENT_TYPE_LABEL[e.event_type]}</span>
                  <span>· {humanize(e.role)}</span>
                </div>
                <Link href={`/events/${e.slug}`} className="text-sm text-zinc-100 hover:underline underline-offset-4">{e.title}</Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Claims */}
      {claims.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Recent claims</SectionTitle>
          <ul className="space-y-2">
            {claims.map((c) => (
              <li key={c.id} className="glass flex flex-wrap items-start gap-2 rounded-xl px-4 py-3 text-sm">
                <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${CLAIM_STATUS_CLASS[c.status]}`}>{CLAIM_STATUS_LABEL[c.status]}</span>
                <span className="min-w-0 flex-1 text-zinc-200">{c.claim_text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What to watch */}
      {watch.length > 0 && (
        <section className="mt-8">
          <SectionTitle>What to watch</SectionTitle>
          <ul className="space-y-1.5 text-sm">
            {watch.map(({ w, e }, i) => (
              <li key={i} className="text-zinc-300">
                {w} <Link href={`/events/${e.slug}`} className="text-xs text-zinc-500 hover:text-zinc-300">— {e.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {events.length === 0 && connected.size === 0 && (
        <p className="mt-8 text-sm text-zinc-500">No events involve this entity yet. Last updated {relativeTime(entity.updated_at)}.</p>
      )}
    </main>
  );
}
