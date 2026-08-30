"use client";

import { useState } from "react";
import type { EventType } from "@/lib/intelligence-types";

/**
 * Story visual. Uses the event's real source image (og:image of the primary source)
 * when present; otherwise a restrained, category-specific abstract backdrop — dark,
 * textured, no neon — so the composition survives without inventing imagery.
 */
export default function EditorialVisual({
  src,
  alt = "",
  eventType,
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: {
  src?: string | null;
  alt?: string;
  eventType: EventType | string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = !!src && !failed;
  return (
    <div className={`relative overflow-hidden bg-[#0b0c11] ${className}`}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt}
          sizes={sizes}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <Abstract eventType={eventType} />
      )}
    </div>
  );
}

/** Category-driven abstract: a faint structural motif on near-black. Pure CSS/SVG. */
function Abstract({ eventType }: { eventType: EventType | string }) {
  const t = String(eventType);
  const tone =
    t === "SECURITY_INCIDENT" ? "#10b981" :
    t === "CHIP_DEVELOPMENT" || t === "INFRASTRUCTURE_EXPANSION" ? "#f59e0b" :
    t === "MODEL_RELEASE" || t === "RESEARCH_BREAKTHROUGH" ? "#a78bfa" :
    ["FUNDING", "ACQUISITION", "INVESTMENT", "IPO", "EARNINGS"].includes(t) ? "#38bdf8" :
    ["REGULATION", "LAWSUIT", "POLICY_STATEMENT"].includes(t) ? "#fb7185" : "#a1a1aa";
  return (
    <div className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.03]">
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 90% at 85% 20%, ${tone}14 0%, transparent 55%), radial-gradient(80% 60% at 20% 100%, ${tone}0d 0%, transparent 60%)` }} />
      <svg className="absolute inset-0 h-full w-full opacity-[0.22]" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <pattern id={`grid-${t}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" fill="none" stroke={tone} strokeOpacity="0.18" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="400" height="260" fill={`url(#grid-${t})`} />
        <g fill="none" stroke={tone} strokeOpacity="0.55" strokeWidth="0.8">
          <circle cx="300" cy="120" r="70" />
          <circle cx="300" cy="120" r="46" strokeDasharray="3 5" />
          <circle cx="300" cy="120" r="22" />
          <path d="M60 200 C140 180, 180 120, 260 118 S 360 80, 400 60" strokeOpacity="0.35" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#07080b_100%)]" />
    </div>
  );
}
