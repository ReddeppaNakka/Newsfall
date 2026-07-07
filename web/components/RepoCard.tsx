"use client";

import { useEffect, useState } from "react";
import type { Repo } from "@/lib/types";

/**
 * Premium repo card — trending / notable open-source projects. Clicking opens an
 * in-app detail modal (built from the data already on the card) with a full brief
 * and a "View on GitHub" button. Emerald accent when flagged beginner-friendly
 * (has good first issues), else violet.
 */

/** Compact star count: 1234 -> "1.2k", 523182 -> "523k". */
function stars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return String(n);
}

export default function RepoCard({ repo }: { repo: Repo }) {
  const gfi = repo.is_good_first_issue;
  const glow = gfi ? "hover:shadow-glow-emerald" : "hover:shadow-glow-violet";
  const ring = gfi ? "ring-emerald-400/50" : "ring-violet-400/50";
  const ringHover = gfi ? "group-hover:ring-emerald-400/50" : "group-hover:ring-violet-400/50";
  const cta = gfi ? "text-emerald-300" : "text-violet-300";
  const btn = gfi ? "bg-emerald-500 hover:bg-emerald-400" : "bg-violet-500 hover:bg-violet-400";
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group glass relative flex w-full flex-col overflow-hidden rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-1 ${glow}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-200/90">
            <span aria-hidden>⭐</span>
            {stars(repo.stars)}
          </span>
          {gfi && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
              🌱 Good first issue
            </span>
          )}
        </div>

        <h3 className="mt-3 truncate text-lg font-semibold text-zinc-100 group-hover:text-white">
          {repo.name}
        </h3>
        {repo.owner && <p className="mt-0.5 text-sm text-zinc-500">{repo.owner}</p>}

        {repo.description && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{repo.description}</p>
        )}

        {repo.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {repo.topics.slice(0, 4).map((t) => (
              <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                {t}
              </span>
            ))}
          </div>
        )}

        {repo.language && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-300">💻 {repo.language}</span>
          </div>
        )}

        <span className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${cta} transition-colors`}>
          View details
          <svg
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </span>

        <span
          className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition ${ringHover}`}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className={`glass relative my-4 w-full max-w-xl rounded-3xl p-7 ring-1 ${ring}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-zinc-300 transition hover:bg-white/20 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-200/90">
                <span aria-hidden>⭐</span>
                {repo.stars.toLocaleString()} stars
              </span>
              {gfi && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  🌱 Good first issue
                </span>
              )}
            </div>
            <h2 className="mt-3 pr-8 text-2xl font-bold text-white">{repo.name}</h2>
            {repo.owner && <p className="mt-1 text-sm text-zinc-400">by {repo.owner}</p>}

            {repo.description && (
              <p className="mt-4 leading-relaxed text-zinc-300">{repo.description}</p>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {repo.language && <Meta label="Language" value={repo.language} />}
              <Meta label="Stars" value={repo.stars.toLocaleString()} />
              {gfi && <Meta label="Beginner-friendly" value="Has good first issues" />}
            </div>

            {repo.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {repo.topics.map((t) => (
                  <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <a
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${btn}`}
              >
                View on GitHub
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </a>
              <button
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-zinc-400 transition hover:text-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-200">{value}</div>
    </div>
  );
}
