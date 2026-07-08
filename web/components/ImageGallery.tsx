"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Image thumbnails + an in-app lightbox. Clicking a thumbnail opens the full image
 * in an overlay (same window) with prev/next, a counter, and close on Escape / backdrop
 * click. Used by the topic popup (variant="strip") and the deep-dive page (variant="grid").
 *
 * The overlay uses z-[60] so it sits ABOVE the topic modal (z-50).
 */
export default function ImageGallery({
  images,
  alt,
  variant = "grid",
}: {
  images: string[];
  alt: string;
  variant?: "grid" | "strip";
}) {
  const shown = images.slice(0, variant === "strip" ? 5 : 6);
  const [idx, setIdx] = useState<number | null>(null);
  const open = idx !== null;

  const close = useCallback(() => setIdx(null), []);
  const prev = useCallback(
    () => setIdx((i) => (i === null ? i : (i - 1 + shown.length) % shown.length)),
    [shown.length],
  );
  const next = useCallback(
    () => setIdx((i) => (i === null ? i : (i + 1) % shown.length)),
    [shown.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, prev, next]);

  if (!shown.length) return null;

  return (
    <>
      {variant === "strip" ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((src, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)} className="shrink-0" title="Click to enlarge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${alt} ${i + 1}`}
                className="h-24 w-40 cursor-zoom-in rounded-xl object-cover ring-1 ring-white/10 transition hover:ring-white/40 hover:brightness-110"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className="group block overflow-hidden rounded-2xl ring-1 ring-white/10"
              title="Click to enlarge"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${alt} ${i + 1}`}
                className="h-40 w-full cursor-zoom-in object-cover transition duration-300 group-hover:scale-105 group-hover:brightness-110"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm sm:p-8"
          onClick={close}
        >
          <button
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2.5 text-zinc-200 transition hover:bg-white/20 hover:text-white"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>

          {shown.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Previous"
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-zinc-200 transition hover:bg-white/20 hover:text-white sm:left-6"
            >
              <svg className="h-6 w-6 rotate-180" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shown[idx]}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {shown.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Next"
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-zinc-200 transition hover:bg-white/20 hover:text-white sm:right-6"
            >
              <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300">
            {idx + 1} / {shown.length}
          </span>
        </div>
      )}
    </>
  );
}
