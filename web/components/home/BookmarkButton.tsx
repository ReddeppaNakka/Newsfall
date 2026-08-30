"use client";

import { useEffect, useState } from "react";

const KEY = "newsfall:bookmarks";

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/** Save-for-later toggle (per browser, localStorage). Sits inside a card link, so it stops propagation. */
export default function BookmarkButton({ slug, className = "" }: { slug: string; className?: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(read().has(slug)), [slug]);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove bookmark" : "Bookmark story"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const set = read();
        if (set.has(slug)) set.delete(slug); else set.add(slug);
        try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ }
        setSaved(set.has(slug));
      }}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100 ${saved ? "text-violet-300" : ""} ${className}`}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 4.5h12v16l-6-4-6 4v-16Z" />
      </svg>
    </button>
  );
}
