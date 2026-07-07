"use client";

import { useEffect, useState } from "react";
import type { AccentColor, Opportunity, OpportunityKind } from "@/lib/types";

/**
 * Premium opportunity card — hackathons, competitions, conferences, internships, jobs.
 * Mirrors TechCard's glass + neon-glow language, but surfaces the things a fresher
 * actually cares about: deadline, location, prize, and a direct Apply link.
 *
 * Clicking the card opens an in-app detail modal (built from the data already on the
 * card — no extra fetch) with a full brief and an Apply / Register button, instead of
 * jumping straight to the external site.
 */

const ACCENT: Record<AccentColor, { glow: string; ring: string; badge: string; cta: string; btn: string }> = {
  violet: {
    glow: "hover:shadow-glow-violet",
    ring: "group-hover:ring-violet-400/50",
    badge: "bg-violet-500/15 text-violet-300 border-violet-400/30",
    cta: "text-violet-300",
    btn: "bg-violet-500 hover:bg-violet-400",
  },
  cyan: {
    glow: "hover:shadow-glow-cyan",
    ring: "group-hover:ring-cyan-400/50",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30",
    cta: "text-cyan-300",
    btn: "bg-cyan-500 hover:bg-cyan-400",
  },
  emerald: {
    glow: "hover:shadow-glow-emerald",
    ring: "group-hover:ring-emerald-400/50",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    cta: "text-emerald-300",
    btn: "bg-emerald-500 hover:bg-emerald-400",
  },
};

const KIND_META: Record<OpportunityKind, { label: string; icon: string }> = {
  hackathon: { label: "Hackathon", icon: "⚡" },
  competition: { label: "Competition", icon: "🏆" },
  conference: { label: "Conference", icon: "🎤" },
  internship: { label: "Internship", icon: "🎓" },
  job: { label: "Job", icon: "💼" },
  scholarship: { label: "Scholarship", icon: "📚" },
};

/** Human, timezone-stable deadline label computed on the server (no hydration drift). */
function deadlineLabel(deadline: string | null): { text: string; urgent: boolean; closed: boolean } {
  if (!deadline) return { text: "Rolling / no deadline", urgent: false, closed: false };
  const end = new Date(deadline).getTime();
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  if (days < 0) return { text: "Closed", urgent: false, closed: true };
  if (days === 0) return { text: "Closes today", urgent: true, closed: false };
  if (days === 1) return { text: "Closes tomorrow", urgent: true, closed: false };
  if (days <= 7) return { text: `Closes in ${days} days`, urgent: true, closed: false };
  return {
    text: `Closes ${new Date(deadline).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
    urgent: false,
    closed: false,
  };
}

/** Longer, human date for the modal (e.g. "15 September 2026"). */
function longDate(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export default function OpportunityCard({ opp }: { opp: Opportunity }) {
  const accent = ACCENT[opp.accent_color] ?? ACCENT.cyan;
  const kind = KIND_META[opp.kind] ?? { label: opp.kind, icon: "•" };
  const dl = deadlineLabel(opp.deadline);
  const [open, setOpen] = useState(false);

  // Close on Escape + lock body scroll while the modal is open.
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
        className={`group glass relative flex w-full flex-col overflow-hidden rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-1 ${accent.glow} ${
          dl.closed ? "opacity-60" : ""
        }`}
      >
        {/* Top row: kind badge + deadline pill */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${accent.badge}`}
          >
            <span aria-hidden>{kind.icon}</span>
            {kind.label}
          </span>
          <span
            className={`shrink-0 text-xs font-medium ${
              dl.closed ? "text-zinc-600" : dl.urgent ? "text-rose-300" : "text-zinc-400"
            }`}
          >
            {dl.text}
          </span>
        </div>

        {/* Title + organizer */}
        <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-zinc-100 group-hover:text-white">
          {opp.title}
        </h3>
        {opp.organizer && <p className="mt-0.5 text-sm text-zinc-500">by {opp.organizer}</p>}

        {/* Description */}
        {opp.description && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{opp.description}</p>
        )}

        {/* Meta chips: location, prize, eligibility */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {(opp.location || opp.is_remote) && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-300">
              📍 {opp.is_remote ? "Remote" : opp.location}
              {opp.country && opp.country !== "Global" ? ` · ${opp.country}` : ""}
            </span>
          )}
          {opp.prize && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-amber-200/90">💰 {opp.prize}</span>
          )}
          {opp.eligibility && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-zinc-400">✅ {opp.eligibility}</span>
          )}
        </div>

        {/* CTA hint — the whole card opens the detail modal */}
        <span
          className={`mt-4 inline-flex items-center gap-1 text-sm font-medium ${accent.cta} transition-colors`}
        >
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
          className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition ${accent.ring}`}
        />
      </button>

      {/* Detail modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className={`glass relative my-4 w-full max-w-xl rounded-3xl p-7 ring-1 ${accent.ring.replace("group-hover:", "")}`}
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

            {/* Header */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${accent.badge}`}
            >
              <span aria-hidden>{kind.icon}</span>
              {kind.label}
            </span>
            <h2 className="mt-3 pr-8 text-2xl font-bold text-white">{opp.title}</h2>
            {opp.organizer && <p className="mt-1 text-sm text-zinc-400">by {opp.organizer}</p>}

            {/* Deadline banner */}
            <div
              className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
                dl.closed
                  ? "bg-white/5 text-zinc-500"
                  : dl.urgent
                    ? "bg-rose-500/10 text-rose-200"
                    : "bg-white/5 text-zinc-300"
              }`}
            >
              🗓 {dl.text}
              {opp.deadline && !dl.closed ? ` · deadline ${longDate(opp.deadline)}` : ""}
            </div>

            {/* Full description */}
            {opp.description && (
              <p className="mt-4 leading-relaxed text-zinc-300">{opp.description}</p>
            )}

            {/* Detail grid */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(opp.location || opp.is_remote) && (
                <Meta label="Location" value={`${opp.is_remote ? "Remote" : opp.location ?? ""}${opp.country && opp.country !== "Global" ? ` · ${opp.country}` : ""}`} />
              )}
              {opp.prize && <Meta label="Prize" value={opp.prize} />}
              {opp.eligibility && <Meta label="Eligibility" value={opp.eligibility} />}
              {opp.starts_at && <Meta label="Starts" value={longDate(opp.starts_at) ?? ""} />}
            </div>

            {/* Tags */}
            {opp.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {opp.tags.map((t) => (
                  <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Apply / Register */}
            <div className="mt-6 flex items-center gap-3">
              <a
                href={opp.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${accent.btn}`}
              >
                {dl.closed ? "View details" : opp.kind === "conference" ? "Register" : "Apply / Register"}
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
