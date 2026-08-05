import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Opportunity } from "@/lib/types";
import OpportunitiesFeed from "@/components/OpportunitiesFeed";

/**
 * /opportunities — the full, filterable board of fresher opportunities:
 * hackathons, competitions, conferences, internships, jobs & scholarships.
 * Server-rendered from Supabase with hourly ISR; filtering happens client-side.
 */
export const revalidate = 60;

export const metadata = {
  title: "Opportunities for Freshers — News_Pond",
  description:
    "Hackathons, competitions, conferences, internships and jobs for entry-level engineers — India-first, global included.",
};

export default async function OpportunitiesPage() {
  const { data } = await supabase
    .from("opportunities")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("deadline", { ascending: true, nullsFirst: false });

  // Only show currently-open opportunities: evergreen (no deadline) or deadline not yet
  // passed — so a listing stays up until its last date, then drops off automatically.
  const now = Date.now();
  const opportunities = ((data ?? []) as Opportunity[]).filter(
    (o) => !o.deadline || new Date(o.deadline).getTime() >= now,
  );

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        ← Back to News_Pond
      </Link>

      <header className="mb-8 mt-5 sm:mb-10 sm:mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          Opportunities for Freshers
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Hackathons, competitions, conferences, internships and entry-level jobs —
          auto-aggregated so you never have to hunt across a dozen sites. India-first,
          global included.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          {opportunities.length} opportunities tracked
        </p>
      </header>

      <OpportunitiesFeed items={opportunities} />

      <footer className="mt-16 border-t border-white/5 pb-safe pt-8 text-center text-xs text-zinc-600 sm:mt-20 sm:pt-10 sm:text-sm">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
