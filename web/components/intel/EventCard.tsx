import Link from "next/link";
import type { EventWithEntities, IntelEvent } from "@/lib/intelligence-types";
import { EVENT_TYPE_LABEL, relativeTime } from "@/lib/format";
import EntityChip from "./EntityChip";
import { ConfidenceMeter, ImportanceMeter, Tag } from "./Scores";

/**
 * One event in the intelligence feed. Dense, editorial: title → why it matters →
 * instrument row (importance / confidence / sources) → entities. No glow, no gradient.
 */
export default function EventCard({ event, compact = false }: { event: EventWithEntities | IntelEvent; compact?: boolean }) {
  const entities = "entities" in event ? event.entities : [];
  return (
    <article className="glass rounded-xl p-4 transition hover:border-white/20 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span className="font-medium uppercase tracking-wide text-zinc-400">{EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}</span>
        <span>·</span>
        <time>{relativeTime(event.last_updated_at)}</time>
        {event.has_contradiction && <Tag tone="warn">Contradiction</Tag>}
        {event.primary_source_confirmed && <Tag tone="good">Primary source</Tag>}
        {event.status === "UPDATED" && <Tag>Updated</Tag>}
      </div>

      <h3 className="mt-2 text-base font-semibold leading-snug text-zinc-50 sm:text-lg">
        <Link href={`/events/${event.slug}`} className="hover:underline decoration-zinc-600 underline-offset-4">
          {event.title}
        </Link>
      </h3>

      {!compact && (event.why_it_matters || event.summary) && (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-400">{event.why_it_matters || event.summary}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <ImportanceMeter score={Number(event.importance_score)} compact />
        <ConfidenceMeter value={Number(event.confidence_score)} compact />
        <span className="text-xs text-zinc-500">
          {event.independent_source_count} independent {event.independent_source_count === 1 ? "source" : "sources"} · {event.article_count} {event.article_count === 1 ? "article" : "articles"}
        </span>
      </div>

      {entities.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {entities.slice(0, compact ? 3 : 6).map((e) => (
            <EntityChip key={e.id} entity={e} role={e.role} />
          ))}
        </div>
      )}
    </article>
  );
}
