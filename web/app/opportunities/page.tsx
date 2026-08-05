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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <Link
        href="/"
        className="text-sm text-zinc-500 transition hover:text-zinc-300"
      >
        ← Back to News_Pond
      </Link>

      <header className="mb-10 mt-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">
          Opportunities for Freshers
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Hackathons, competitions, conferences, internships and entry-level jobs —
          auto-aggregated so you never have to hunt across a dozen sites. India-first,
          global included.
        </p>
        <p className="mt-2 text-sm text-zinc-600">
          {opportunities.length} opportunities tracked
        </p>
      </header>

      <OpportunitiesFeed items={opportunities} />

      <footer className="mt-20 border-t border-white/5 pt-10 text-center text-sm text-zinc-600">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
