import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { LearningResource } from "@/lib/types";
import LearningFeed from "@/components/LearningFeed";

/**
 * /learn — free courses, certifications and talks, aggregated from Microsoft Learn
 * and YouTube (freeCodeCamp + vendor dev channels). Server-rendered with hourly ISR;
 * filtering by kind / search happens client-side.
 */
export const revalidate = 3600;

export const metadata = {
  title: "Free Courses & Certifications — News_Pond",
  description:
    "Free developer courses, certifications and conference talks aggregated from Microsoft Learn, freeCodeCamp and more.",
};

export default async function LearnPage() {
  const { data } = await supabase
    .from("learning_resources")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false });

  const items = (data ?? []) as LearningResource[];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-10 mt-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">Learn & Get Certified</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Free courses, professional certifications and conference talks — aggregated so you can
          skill up without hunting across platforms. Filter by type or search a topic.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{items.length} resources tracked</p>
      </header>

      <LearningFeed items={items} />

      <footer className="mt-20 border-t border-white/5 pt-10 text-center text-sm text-zinc-600">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
