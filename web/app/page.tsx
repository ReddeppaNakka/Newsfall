import Link from "next/link";
import { Suspense } from "react";
import { getHomepageData } from "@/lib/intelligence";
import NewsfallHeader from "@/components/home/NewsfallHeader";
import BigStory from "@/components/home/BigStory";
import StoryRail from "@/components/home/StoryRail";
import SignalList from "@/components/home/SignalList";
import WatchNext from "@/components/home/WatchNext";
import EntityFocus from "@/components/home/EntityFocus";
import TopicModal from "@/components/TopicModal";

/**
 * Homepage — "The world of technology, already filtered for you."
 *
 * Header → The Big Story → While you were away → Signals + What to watch next →
 * Entities in focus → footer. Every section is selected from the intelligence layer
 * (ranked by importance, confidence, corroboration and recency — never by publish
 * time alone). Server-rendered, ISR 60s, no AI calls at request time.
 *
 * The original technology tracker lives at /technologies; the ?topic= popup still
 * works here so old deep links keep resolving.
 */
export const revalidate = 60;

export default async function HomePage() {
  const data = await getHomepageData();

  return (
    <main className="min-h-screen">
      <NewsfallHeader />

      {data.bigStory ? (
        <BigStory event={data.bigStory} />
      ) : (
        <EmptyState />
      )}

      <div className="space-y-14 pb-16 pt-6 sm:space-y-16">
        <StoryRail events={data.whileAway} />

        {(data.signals.length > 0 || data.watch.length > 0) && (
          <section className="grid grid-cols-1 gap-4 px-6 sm:px-10 lg:grid-cols-[1.35fr_1fr]">
            <SignalList events={data.signals} />
            <WatchNext items={data.watch} />
          </section>
        )}

        <EntityFocus entities={data.entities} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-white/[0.06] px-6 py-8 text-[12px] text-zinc-600 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <span>Newsfall collects, connects, and clarifies what matters in technology.</span>
        <span className="flex flex-wrap gap-x-4">
          <span>Evidence first.</span>
          <span>Signal over noise.</span>
          <span>Intelligence that compounds.</span>
        </span>
      </footer>

      <Suspense fallback={null}>
        <TopicModal />
      </Suspense>
    </main>
  );
}

function EmptyState() {
  return (
    <section className="px-6 pb-12 pt-10 sm:px-10 md:pt-16">
      <p className="flex items-center gap-3 text-[11px] font-semibold tracking-[0.22em] text-violet-300">
        THE BIG STORY <span className="h-px w-10 bg-violet-300/40" />
      </p>
      <h1 className="mt-5 max-w-3xl font-serif text-[2.6rem] leading-[1.05] text-white sm:text-[3.6rem]">The intelligence layer is warming up.</h1>
      <p className="mt-5 max-w-md text-[15px] leading-relaxed text-zinc-400">
        No events have been processed yet. Apply <code className="text-zinc-300">supabase/migrations/001</code> and run <code className="text-zinc-300">python -m newsfall.run</code>.
        Meanwhile the <Link href="/technologies" className="text-zinc-200 underline underline-offset-4">technology tracker</Link> is live.
      </p>
    </section>
  );
}
