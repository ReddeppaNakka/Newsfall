import Link from "next/link";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import type { Technology } from "@/lib/types";
import Highlights from "@/components/Highlights";
import TechExplorer from "@/components/TechExplorer";
import HotTopicsFeed from "@/components/HotTopicsFeed";
import TopicModal from "@/components/TopicModal";

/**
 * /technologies — the original Newsfall tracker (languages, frameworks, frontier models):
 * this week's highlights, the searchable explorer, hot topics, and the ?topic= popup.
 * Moved here unchanged from the homepage when the homepage became the intelligence front page.
 */
export const revalidate = 60;

export const metadata = {
  title: "Technologies — Newsfall",
  description: "Live tracker for frontier AI models, languages, frameworks and developer tools.",
};

export default async function TechnologiesPage() {
  const { data: techs } = await supabase.from("technologies").select("*").order("category", { ascending: true }).order("name", { ascending: true });
  const { data: hot } = await supabase
    .from("updates")
    .select("*, technology:technologies!inner(name, slug, accent_color, is_featured)")
    .eq("technology.is_featured", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(12);
  const { data: recent } = await supabase
    .from("updates")
    .select("*, technology:technologies!inner(name, slug, accent_color)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);

  const technologies = (techs ?? []) as Technology[];
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const highlights = ((recent ?? []) as { importance?: number; published_at: string | null }[])
    .filter((u) => (u.importance ?? 0) >= 4 && !!u.published_at && now - new Date(u.published_at).getTime() <= WEEK_MS)
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0) || (a.published_at! < b.published_at! ? 1 : -1))
    .slice(0, 6);

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">← Back to Newsfall</Link>
        <h1 className="mt-5 font-serif text-4xl text-zinc-50 sm:text-5xl">Technologies</h1>
        <p className="mt-3 max-w-2xl text-[15px] text-zinc-400">Every model release, language version and framework update — tracking {technologies.length} technologies, refreshed daily.</p>
      </div>
      <Highlights items={highlights as never} />
      <TechExplorer techs={technologies} />
      <HotTopicsFeed items={(hot ?? []) as never} />
      <Suspense fallback={null}>
        <TopicModal />
      </Suspense>
    </main>
  );
}
