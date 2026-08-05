import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { LearningResource } from "@/lib/types";
import LearningFeed from "@/components/LearningFeed";

/**
 * /learn — free courses, certifications and talks, aggregated from Microsoft Learn
 * and YouTube (freeCodeCamp + vendor dev channels). Server-rendered with hourly ISR;
 * filtering by kind / search happens client-side.
 */
export const revalidate = 60;

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
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-8 mt-5 sm:mb-10 sm:mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">Learn & Get Certified</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Free courses, professional certifications and conference talks — aggregated so you can
          skill up without hunting across platforms. Filter by type or search a topic.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{items.length} resources tracked</p>
      </header>

      <LearningFeed items={items} />

      <footer className="mt-16 border-t border-white/5 pb-safe pt-8 text-center text-xs text-zinc-600 sm:mt-20 sm:pt-10 sm:text-sm">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
