import LiveClock from "./LiveClock";

/** Understated masthead: brand, tagline, live indicator + clock. */
export default function NewsfallHeader() {
  return (
    // Desktop masthead only — on mobile the sticky top bar (Sidebar) already carries the brand,
    // and this row's minimum width would otherwise exceed a 390px viewport.
    <header className="hidden items-center justify-between gap-6 px-6 pb-2 pt-7 sm:px-10 md:flex">
      <div className="flex min-w-0 items-center gap-6">
        <span className="font-sans text-[22px] font-semibold tracking-[0.32em] text-white">NEWSFALL</span>
        <span className="hidden h-8 w-px bg-white/10 lg:block" />
        <div className="hidden leading-tight lg:block">
          <p className="text-[11px] font-medium tracking-[0.22em] text-zinc-500">THE WORLD OF TECHNOLOGY</p>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-zinc-200">RIGHT NOW</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[11px] font-medium tracking-[0.12em]">
        <span className="flex items-center gap-2 text-zinc-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-400" />
          </span>
          LIVE
        </span>
        <LiveClock />
      </div>
    </header>
  );
}
