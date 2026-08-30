import type { EventWithEntities } from "@/lib/intelligence-types";
import SectionHeading from "./SectionHeading";
import StoryCard from "./StoryCard";

/** WHILE YOU WERE AWAY — four premium story tiles (horizontal rail on mobile). */
export default function StoryRail({ events }: { events: EventWithEntities[] }) {
  if (!events.length) return null;
  return (
    <section className="px-6 sm:px-10">
      <SectionHeading title="WHILE YOU WERE AWAY" action={{ label: "See all updates", href: "/intelligence" }} />
      <div className="no-scrollbar -mx-6 flex snap-x gap-4 overflow-x-auto px-6 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {events.map((e) => (
          <div key={e.id} className="w-[78vw] shrink-0 snap-start sm:w-auto">
            <StoryCard event={e} />
          </div>
        ))}
      </div>
    </section>
  );
}
