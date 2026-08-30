import Link from "next/link";
import type { EventWithEntities } from "@/lib/intelligence-types";
import { categoryFor } from "@/lib/category";
import { relativeTime } from "@/lib/format";
import EntityMark from "./EntityMark";
import EditorialVisual from "./EditorialVisual";
import BookmarkButton from "./BookmarkButton";

/**
 * Magazine story tile (While you were away): image with the lead entity's mark and
 * a timestamp overlaid, a strong headline, then "CATEGORY · N SOURCES" and a bookmark.
 * No importance badge here — curiosity, not instrumentation.
 */
export default function StoryCard({ event }: { event: EventWithEntities }) {
  const lead = event.entities.find((e) => e.role !== "MENTIONED") ?? event.entities[0];
  const cat = categoryFor(event.event_type);
  const sources = event.source_count || event.article_count;
  return (
    <Link
      href={`/events/${event.slug}`}
      aria-label={event.title}
      className="group flex flex-col overflow-hidden rounded-lg border border-white/[0.07] bg-surface transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
    >
      <div className="relative">
        <EditorialVisual src={event.image_url} eventType={event.event_type} className="aspect-[16/11] w-full" sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3">
          {lead ? (
            <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
              <EntityMark entity={lead} size={22} />
              {lead.name}
            </span>
          ) : <span />}
          <span className="text-[11px] text-zinc-300">{relativeTime(event.last_updated_at)}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <h3 className="text-[17px] font-medium leading-snug text-zinc-50">{event.title}</h3>
        <div className="mt-auto flex items-center justify-between pt-5">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-zinc-400">
            <span className={cat.text}>{cat.label.toUpperCase()}</span>
            <span className="mx-1.5 text-zinc-600">·</span>
            {sources} {sources === 1 ? "SOURCE" : "SOURCES"}
          </p>
          <BookmarkButton slug={event.slug} className="-mr-2" />
        </div>
      </div>
    </Link>
  );
}
