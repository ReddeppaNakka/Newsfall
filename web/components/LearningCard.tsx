"use client";

import { useEffect, useState } from "react";
import type { AccentColor, LearningResource, LearningKind } from "@/lib/types";
import Icon, { type IconName } from "@/components/Icon";

/**
 * Premium learning-resource card — free courses, certifications, and talks. Clicking
 * opens an in-app detail modal (built from the data already on the card) with a full
 * brief and a "Start learning" / "View certification" button. Accent encodes kind:
 * course = cyan, certification = emerald, talk/video = violet.
 */

const ACCENT: Record<
  AccentColor,
  { glow: string; ring: string; ringHover: string; badge: string; cta: string; btn: string }
> = {
  violet: {
    glow: "hover:shadow-glow-violet",
    ring: "ring-violet-400/50",
    ringHover: "group-hover:ring-violet-400/50",
    badge: "bg-violet-500/15 text-violet-300 border-violet-400/30",
    cta: "text-violet-300",
    btn: "bg-violet-500 hover:bg-violet-400",
  },
  cyan: {
    glow: "hover:shadow-glow-cyan",
    ring: "ring-cyan-400/50",
    ringHover: "group-hover:ring-cyan-400/50",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30",
    cta: "text-cyan-300",
    btn: "bg-cyan-500 hover:bg-cyan-400",
  },
  emerald: {
    glow: "hover:shadow-glow-emerald",
    ring: "ring-emerald-400/50",
    ringHover: "group-hover:ring-emerald-400/50",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    cta: "text-emerald-300",
    btn: "bg-emerald-500 hover:bg-emerald-400",
  },
};

const KIND_META: Record<LearningKind, { label: string; icon: IconName; accent: AccentColor }> = {
  course: { label: "Course", icon: "book", accent: "cyan" },
  certification: { label: "Certification", icon: "certificate", accent: "emerald" },
  talk: { label: "Talk", icon: "microphone", accent: "violet" },
  video: { label: "Video", icon: "play", accent: "violet" },
};

export default function LearningCard({ item }: { item: LearningResource }) {
  const meta = KIND_META[item.kind] ?? { label: item.kind, icon: "book" as IconName, accent: "cyan" as AccentColor };
  const accent = ACCENT[meta.accent];
  const [open, setOpen] = useState(false);
  const cta = item.kind === "certification" ? "View certification" : "Start learning";

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
        className={`group glass relative flex w-full flex-col overflow-hidden rounded-2xl p-5 text-left transition-all duration-300 hover:-translate-y-1 ${accent.glow}`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${accent.badge}`}
            >
              <Icon name={meta.icon} className="h-3.5 w-3.5" />
              {meta.label}
            </span>
            {item.is_featured && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                <Icon name="star" className="h-3 w-3" /> Popular
              </span>
            )}
          </div>
          {item.level && <span className="shrink-0 text-xs font-medium text-zinc-400">{item.level}</span>}
        </div>

        <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-zinc-100 group-hover:text-white">
          {item.title}
        </h3>
        {item.provider && <p className="mt-0.5 text-sm text-zinc-500">by {item.provider}</p>}

        {item.description && (
          <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{item.description}</p>
        )}

        {item.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.topics.slice(0, 4).map((t) => (
              <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          {item.is_free && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-emerald-300/90"><Icon name="check" className="h-3 w-3" /> Free</span>
          )}
          {item.has_certificate && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-amber-200/90"><Icon name="certificate" className="h-3 w-3" /> Certificate</span>
          )}
          {item.duration && (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-zinc-400"><Icon name="clock" className="h-3 w-3" /> {item.duration}</span>
          )}
        </div>

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
          className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition ${accent.ringHover}`}
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
          onClick={() => setOpen(false)}
        >
          <div
            className={`glass relative my-4 w-full max-w-xl rounded-3xl p-7 ring-1 ${accent.ring}`}
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

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${accent.badge}`}
              >
                <Icon name={meta.icon} className="h-3.5 w-3.5" />
                {meta.label}
              </span>
              {item.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                  <Icon name="star" className="h-3 w-3" /> Popular
                </span>
              )}
            </div>
            <h2 className="mt-3 pr-8 text-2xl font-bold text-white">{item.title}</h2>
            {item.provider && <p className="mt-1 text-sm text-zinc-400">by {item.provider}</p>}

            {item.description && (
              <p className="mt-4 leading-relaxed text-zinc-300">{item.description}</p>
            )}

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {item.level && <Meta label="Level" value={item.level} />}
              <Meta label="Cost" value={item.is_free ? "Free to access" : "Paid"} />
              {item.has_certificate && <Meta label="Certificate" value="Yes" />}
              {item.duration && <Meta label="Duration" value={item.duration} />}
            </div>

            {item.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {item.topics.map((t) => (
                  <span key={t} className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-300">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition ${accent.btn}`}
              >
                {cta}
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
