import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Repo } from "@/lib/types";
import ReposFeed from "@/components/ReposFeed";

/**
 * /repos — trending & notable open-source repositories to learn from or contribute
 * to, from the GitHub Search API. Server-rendered with hourly ISR; filtering by
 * beginner-friendly / language / search happens client-side.
 */
export const revalidate = 60;

export const metadata = {
  title: "Trending GitHub Repos — News_Pond",
  description:
    "Trending and beginner-friendly open-source repositories to learn from and contribute to.",
};

export default async function ReposPage() {
  const { data } = await supabase
    .from("repos")
    .select("*")
    .order("stars", { ascending: false });

  const repos = (data ?? []) as Repo[];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-8 mt-5 sm:mb-10 sm:mt-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">Trending Repositories</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Notable open-source projects worth learning from — filter to beginner-friendly repos
          (with good first issues) to make your first contribution.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{repos.length} repos tracked</p>
      </header>

      <ReposFeed items={repos} />

      <footer className="mt-16 border-t border-white/5 pb-safe pt-8 text-center text-xs text-zinc-600 sm:mt-20 sm:pt-10 sm:text-sm">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
