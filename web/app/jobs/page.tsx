import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Job } from "@/lib/types";
import JobsFeed from "@/components/JobsFeed";

/**
 * /jobs — the full, filterable board of fresher-focused remote tech jobs, aggregated
 * from free sources (RemoteOK, We Work Remotely). Server-rendered with hourly ISR;
 * filtering (fresher / region / skill search) happens client-side.
 */
export const revalidate = 60;

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
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-8 mt-5 sm:mb-10 sm:mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">Remote Tech Jobs</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Fresher-friendly remote developer roles, auto-aggregated from free sources so you
          never have to hunt across a dozen boards. Search by skill, filter to entry-level.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{jobs.length} jobs tracked</p>
      </header>

      <JobsFeed items={jobs} />

      <footer className="mt-16 border-t border-white/5 pb-safe pt-8 text-center text-xs text-zinc-600 sm:mt-20 sm:pt-10 sm:text-sm">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
