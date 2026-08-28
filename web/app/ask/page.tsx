import Link from "next/link";
import AskNewsfall from "@/components/intel/AskNewsfall";

export const metadata = {
  title: "Ask Newsfall — Evidence-grounded answers",
  description: "Ask questions about companies, people, technologies and events. Answers are grounded in Newsfall's verified evidence base.",
};

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 sm:px-6 sm:py-16">
      <Link href="/" className="-my-1 inline-flex min-h-[40px] items-center text-sm text-zinc-500 transition hover:text-zinc-300">
        ← Back to Newsfall
      </Link>
      <header className="mb-8 mt-5 sm:mt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Ask Newsfall</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">Reason over the evidence</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-400 sm:text-base">
          Answers are built only from Newsfall&apos;s verified events, claims and source articles — with citations, stated
          confidence, and open uncertainties. This is not a general chatbot.
        </p>
      </header>
      <AskNewsfall initialQuestion={q ?? ""} />
    </main>
  );
}
