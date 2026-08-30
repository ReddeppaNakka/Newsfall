"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Global navigation. Desktop: a narrow 72px icon rail with a hairline separator
 * (editorial, not admin-dashboard). Mobile: an in-flow top bar plus a slide-in
 * drawer with labels. The active item gets a subtle elevated surface.
 */

type NavItem = { href: string; label: string; icon: string; match: (p: string) => boolean };

// 24×24 outline paths, 1.5px stroke.
const ICONS = {
  home: "m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25",
  signal: "M3 18.75h18M5.25 15.75v-3m4.5 3V9.75m4.5 6V6.75m4.5 9V3.75",
  network: "M12 5.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm0 0v4.5m0 0a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm0 4.5 5.25 4.5m-5.25-4.5-5.25 4.5m10.5 0a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Zm-10.5 0a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z",
  ask: "M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
  cpu: "M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25Zm.75-12h9v9h-9v-9Z",
  briefcase: "M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z",
  trophy: "M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  code: "M14.25 9.75 16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0 0 20.25 18V6A2.25 2.25 0 0 0 18 3.75H6A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25Z",
};

const NAV: NavItem[] = [
  { href: "/", label: "Home", icon: ICONS.home, match: (p) => p === "/" },
  { href: "/intelligence", label: "Intelligence", icon: ICONS.signal, match: (p) => p.startsWith("/intelligence") || p.startsWith("/events") },
  { href: "/entities", label: "Entities", icon: ICONS.network, match: (p) => p.startsWith("/entities") },
  { href: "/ask", label: "Ask Newsfall", icon: ICONS.ask, match: (p) => p.startsWith("/ask") },
  { href: "/technologies", label: "Technologies", icon: ICONS.cpu, match: (p) => p.startsWith("/technologies") || p.startsWith("/topic") },
  { href: "/jobs", label: "Jobs", icon: ICONS.briefcase, match: (p) => p.startsWith("/jobs") },
  { href: "/opportunities", label: "Opportunities", icon: ICONS.trophy, match: (p) => p.startsWith("/opportunities") },
  { href: "/learn", label: "Learn", icon: ICONS.book, match: (p) => p.startsWith("/learn") },
  { href: "/repos", label: "Repos", icon: ICONS.code, match: (p) => p.startsWith("/repos") },
];

function Mark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.08] ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-violet-300" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 19V5l12 14V5" />
      </svg>
    </span>
  );
}

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-white/[0.06] bg-canvas/90 px-4 py-2.5 backdrop-blur md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-lg text-zinc-100 transition active:bg-white/10"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-[0.28em] text-white">NEWSFALL</span>
        </Link>
      </header>

      {/* Desktop rail */}
      <aside className="fixed left-0 top-0 z-30 hidden h-[100dvh] w-[72px] flex-col items-center border-r border-white/[0.06] bg-[#07080b] py-5 md:flex">
        <Link href="/" aria-label="Newsfall home" className="flex flex-col items-center gap-1.5">
          <Mark />
          <span className="text-[8px] font-semibold tracking-[0.22em] text-zinc-500">NEWSFALL</span>
        </Link>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 w-11 items-center justify-center rounded-lg transition ${
                  active ? "bg-white/[0.07] text-white ring-1 ring-white/[0.08]" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
                }`}
              >
                <Icon d={item.icon} />
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-3">
          <span className="h-px w-6 bg-white/10" />
          <span className="rotate-180 text-[9px] tracking-[0.2em] text-zinc-600" style={{ writingMode: "vertical-rl" }}>
            EVIDENCE FIRST
          </span>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 animate-fade-in bg-black/70" />
          <aside
            className="absolute left-0 top-0 flex h-[100dvh] w-[min(17rem,85vw)] animate-slide-in-left flex-col overflow-y-auto border-r border-white/[0.08] bg-[#07080b] px-4 py-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2.5">
                <Mark className="h-8 w-8" />
                <span className="text-sm font-semibold tracking-[0.28em] text-white">NEWSFALL</span>
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-[15px] transition ${
                      active ? "bg-white/[0.07] text-white" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                    }`}
                  >
                    <Icon d={item.icon} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <p className="mt-auto px-3 pb-safe pt-8 text-xs leading-relaxed text-zinc-600">Evidence-driven technology intelligence.</p>
          </aside>
        </div>
      )}
    </>
  );
}
