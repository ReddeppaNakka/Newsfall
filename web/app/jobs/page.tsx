import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";
import JobsFeed from "@/components/JobsFeed";

/**
 * /jobs — the full, filterable board of fresher-focused remote tech jobs, aggregated
 * from free sources (RemoteOK, We Work Remotely). Server-rendered with hourly ISR;
 * filtering (fresher / region / skill search) happens client-side.
 */
export const revalidate = 3600;

export const metadata = {
  title: "Remote Tech Jobs for Freshers — News_Pond",
  description:
    "Fresher-friendly remote developer jobs aggregated from free sources — filter by skill, level and region. India-first, global included.",
};

export default async function JobsPage() {
  const { data } = await supabase
    .from("jobs")
    .select("*")
    .order("is_fresher", { ascending: false })
    .order("posted_at", { ascending: false, nullsFirst: false });

  const jobs = (data ?? []) as Job[];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-10 mt-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">Remote Tech Jobs</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Fresher-friendly remote developer roles, auto-aggregated from free sources so you
          never have to hunt across a dozen boards. Search by skill, filter to entry-level.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{jobs.length} jobs tracked</p>
      </header>

      <JobsFeed items={jobs} />

      <footer className="mt-20 border-t border-white/5 pt-10 text-center text-sm text-zinc-600">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
