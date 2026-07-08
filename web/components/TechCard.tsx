import Link from "next/link";
import type { AccentColor, Technology } from "@/lib/types";
import { logoFor } from "@/lib/logo";
import Logo from "./Logo";

/**
 * Premium interactive card.
 * - Glassmorphic surface, logo (or monogram) tile, title + version badge.
 * - Neon glow + lift on hover, color driven by the technology's accent.
 * - Clicking opens the detail popup via /?topic=<slug> (no full-page navigation).
 */

// Map an accent token -> the exact Tailwind classes (static strings so they survive JIT purge).
const ACCENT: Record<
  AccentColor,
  { glow: string; ring: string; badge: string; text: string; grad: string }
> = {
  violet: {
    glow: "hover:shadow-glow-violet",
    ring: "group-hover:ring-violet-400/50",
    badge: "bg-violet-500/15 text-violet-300 border-violet-400/30",
    text: "group-hover:text-violet-300",
    grad: "from-violet-500/30 to-violet-900/10",
  },
  cyan: {
    glow: "hover:shadow-glow-cyan",
    ring: "group-hover:ring-cyan-400/50",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-400/30",
    text: "group-hover:text-cyan-300",
    grad: "from-cyan-500/30 to-cyan-900/10",
  },
  emerald: {
    glow: "hover:shadow-glow-emerald",
    ring: "group-hover:ring-emerald-400/50",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    text: "group-hover:text-emerald-300",
    grad: "from-emerald-500/30 to-emerald-900/10",
  },
};

export default function TechCard({ tech }: { tech: Technology }) {
  const accent = ACCENT[tech.accent_color] ?? ACCENT.violet;
  const logo = logoFor(tech.image_url, tech.homepage_url, tech.name);

  return (
    <Link
      href={`/?topic=${tech.slug}`}
      scroll={false}
      className={`group glass relative flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 ${accent.glow}`}
    >
      {/* Logo tile — real logo when we have one, else a monogram on an accent gradient */}
      <div
        className={`relative flex h-40 w-full items-center justify-center overflow-hidden bg-gradient-to-br ${accent.grad}`}
      >
        <Logo
          src={logo}
          name={tech.name}
          className="h-16 w-16 rounded-2xl object-contain transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/20 to-transparent" />
        {/* Version badge */}
        {tech.current_version && (
          <span
            className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur ${accent.badge}`}
          >
            v{tech.current_version}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <span className="text-[11px] uppercase tracking-widest text-zinc-500">
          {tech.category}
        </span>
        <h3
          className={`mt-1 text-lg font-semibold text-zinc-100 transition-colors ${accent.text}`}
        >
          {tech.name}
        </h3>
        {tech.tagline && (
          <p className="mt-1 line-clamp-2 text-sm text-zinc-400">
            {tech.tagline}
          </p>
        )}
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-zinc-500 transition-colors group-hover:text-zinc-200">
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
      </div>

      {/* Subtle hover ring */}
      <span
        className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition ${accent.ring}`}
      />
    </Link>
  );
}
