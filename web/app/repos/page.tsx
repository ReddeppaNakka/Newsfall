import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Repo } from "@/lib/types";
import ReposFeed from "@/components/ReposFeed";

/**
 * /repos — trending & notable open-source repositories to learn from or contribute
 * to, from the GitHub Search API. Server-rendered with hourly ISR; filtering by
 * beginner-friendly / language / search happens client-side.
 */
export const revalidate = 3600;

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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to News_Pond
      </Link>

      <header className="mb-10 mt-6">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-50">Trending Repositories</h1>
        <p className="mt-3 max-w-2xl text-zinc-400">
          Notable open-source projects worth learning from — filter to beginner-friendly repos
          (with good first issues) to make your first contribution.
        </p>
        <p className="mt-2 text-sm text-zinc-600">{repos.length} repos tracked</p>
      </header>

      <ReposFeed items={repos} />

      <footer className="mt-20 border-t border-white/5 pt-10 text-center text-sm text-zinc-600">
        News_Pond · open source · data auto-refreshed daily
      </footer>
    </main>
  );
}
