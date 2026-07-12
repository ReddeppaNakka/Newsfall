"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { AccentColor, Technology, Update } from "@/lib/types";
import type { Brief } from "@/lib/brief";
import { logoFor } from "@/lib/logo";
import Icon from "@/components/Icon";
import ImageGallery from "./ImageGallery";

/**
 * Detail popup. Opens whenever the URL has ?topic=<slug>. Two-phase load:
 *   1. /api/topic/[slug]        → tech + updates (fast, no LLM) → header shows instantly
 *   2. /api/topic/[slug]/brief  → AI web-grounded brief (slower) → fills in after
 * So the popup never sits on a blank "loading" spinner while the AI works.
 */

interface Basics {
  technology: Technology;
  updates: Update[];
}

const ACCENT: Record<AccentColor, { text: string; ring: string; grad: string; dot: string }> = {
  violet: { text: "text-violet-300", ring: "ring-violet-400/30", grad: "from-violet-500/30 to-violet-900/10", dot: "bg-violet-400" },
  cyan: { text: "text-cyan-300", ring: "ring-cyan-400/30", grad: "from-cyan-500/30 to-cyan-900/10", dot: "bg-cyan-400" },
  emerald: { text: "text-emerald-300", ring: "ring-emerald-400/30", grad: "from-emerald-500/30 to-emerald-900/10", dot: "bg-emerald-400" },
};

function List({ title, items, dot }: { title: string; items: string[]; dot: string }) {
  if (!items.length) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">{title}</h4>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2 text-sm text-zinc-300">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
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

export default function TopicModal() {
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("topic");

  const [basics, setBasics] = useState<Basics | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const close = useCallback(() => {
    router.push(window.location.pathname, { scroll: false });
  }, [router]);

  // Two-phase fetch whenever the slug changes.
  useEffect(() => {
    if (!slug) {
      setBasics(null);
      setBrief(null);
      return;
    }
    let cancelled = false;
    setBasics(null);
    setBrief(null);
    setBriefLoading(true);

    // Phase 1 — fast basics.
    fetch(`/api/topic/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setBasics(d);
      });

    // Phase 2 — AI brief (independent; may take a few seconds).
    fetch(`/api/topic/${encodeURIComponent(slug)}/brief`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setBrief(d?.brief ?? null);
      })
      .finally(() => {
        if (!cancelled) setBriefLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!slug) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [slug, close]);

  if (!slug) return null;

  const tech = basics?.technology;
  const accent = ACCENT[tech?.accent_color ?? "violet"] ?? ACCENT.violet;
  const logo = tech ? logoFor(tech.image_url, tech.homepage_url, tech.name) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={close}
    >
      <div
        className={`glass relative my-4 w-full max-w-2xl rounded-3xl ring-1 ${accent.ring}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-zinc-300 transition hover:bg-white/20 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        {!tech ? (
          <div className="flex h-64 items-center justify-center">
            <span className={`h-2 w-2 animate-ping rounded-full ${accent.dot}`} />
            <span className="ml-3 text-sm text-zinc-400">Loading…</span>
          </div>
        ) : (
          <div className="p-7">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br ${accent.grad}`}>
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={tech.name} className="h-8 w-8 object-contain" loading="lazy" />
                ) : (
                  <span className="text-2xl font-bold text-white/90">{tech.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] uppercase tracking-widest text-zinc-500">{tech.category}</span>
                <h2 className="truncate text-2xl font-bold text-white">{tech.name}</h2>
              </div>
              {tech.current_version && (
                <span className={`ml-auto mr-8 shrink-0 rounded-full border border-white/10 px-3 py-1 text-sm ${accent.text}`}>
                  v{tech.current_version}
                </span>
              )}
            </div>

            {/* Overview */}
            {(brief?.overview || tech.tagline || tech.description) && (
              <p className="mt-4 leading-relaxed text-zinc-300">
                {brief?.overview || tech.description || tech.tagline}
              </p>
            )}

            {/* Relevant images (web-sourced) — click to enlarge in an in-app lightbox */}
            {brief && brief.images.length > 0 && (
              <div className="mt-5">
                <ImageGallery images={brief.images} alt={tech.name} variant="strip" />
              </div>
            )}

            {/* Brief: loading → sections → fallback */}
            {brief ? (
              <>
                {(brief.created_by || brief.released || brief.pricing) && (
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Meta label="Created by" value={brief.created_by} />
                    <Meta label="Released" value={brief.released} />
                    <Meta label="Pricing" value={brief.pricing} />
                  </div>
                )}

                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <List title="Key features" items={brief.features} dot={accent.dot} />
                  <List title="Advantages" items={brief.advantages} dot="bg-emerald-400" />
                  <List title="Limitations" items={brief.disadvantages} dot="bg-rose-400" />
                  <List title="Where to use it" items={brief.use_cases} dot={accent.dot} />
                  <List title="Alternatives" items={brief.alternatives} dot="bg-amber-400" />
                  {brief.value && (
                    <div className="sm:col-span-2">
                      <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">Why it matters</h4>
                      <p className="text-sm text-zinc-300">{brief.value}</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 border-t border-white/5 pt-4">
                  {brief.sources.length > 0 ? (
                    <>
                      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-400">
                        Sources
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                          web-verified
                        </span>
                      </h4>
                      <ul className="space-y-1">
                        {brief.sources.map((s, i) => (
                          <li key={i}>
                            <a href={s.url} target="_blank" rel="noreferrer" className={`text-xs ${accent.text} hover:underline`}>
                              [{i + 1}] {s.title || s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    !brief.grounded && (
                      <p className="inline-flex items-start gap-1.5 text-xs text-zinc-500">
                        <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Written from the AI model&apos;s general knowledge (no live web sources) — may be
                        less precise for new or niche tools.
                      </p>
                    )
                  )}
                </div>
              </>
            ) : briefLoading ? (
              <div className="mt-6 flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3">
                <span className={`h-2 w-2 animate-ping rounded-full ${accent.dot}`} />
                <span className="text-sm text-zinc-400">Generating a web-researched summary… (a few seconds)</span>
              </div>
            ) : (
              <p className="mt-6 rounded-xl bg-white/5 px-4 py-3 text-sm text-zinc-500">
                Detailed summary isn&apos;t available right now — showing the latest updates below.
              </p>
            )}

            {/* Recent updates (from the fast phase) */}
            {basics.updates.length > 0 && (
              <div className="mt-7 border-t border-white/5 pt-5">
                <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">Latest updates</h4>
                <ul className="space-y-2">
                  {basics.updates.slice(0, 5).map((u) => (
                    <li key={u.id}>
                      <a
                        href={u.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
                      >
                        <span className="text-sm text-zinc-300 group-hover:text-white">{u.title}</span>
                        <span className="shrink-0 text-xs text-zinc-600">
                          {u.published_at ? new Date(u.published_at).toLocaleDateString() : ""}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tech.homepage_url && (
              <a
                href={tech.homepage_url}
                target="_blank"
                rel="noreferrer"
                className={`mt-6 inline-block text-sm font-medium ${accent.text} hover:underline`}
              >
                Visit official site ↗
              </a>
            )}

            {/* Know more — final call-to-action → full deep-dive page */}
            <Link
              href={`/topic/${tech.slug}`}
              className={`group/km mt-7 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r ${accent.grad} px-5 py-3.5 ring-1 ${accent.ring} transition hover:brightness-125`}
            >
              <span className="flex items-center gap-2">
                <Icon name="sparkles" className="h-5 w-5" />
                <span className="text-sm font-semibold text-white">
                  Know more — open the full deep dive
                </span>
              </span>
              <svg
                className="h-5 w-5 text-white transition-transform group-hover/km:translate-x-1"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
