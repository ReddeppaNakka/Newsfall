"use client";

import { useState } from "react";
import { initialsAvatar } from "@/lib/logo";

/**
 * Renders a logo image that NEVER shows broken: if the resolved logo fails to load, it
 * swaps to a generated initials tile. Used by cards so every tile has a visible image.
 */
export default function Logo({
  src,
  name,
  className,
}: {
  src: string | null;
  name: string;
  className?: string;
}) {
  const fallback = initialsAvatar(name);
  const [current, setCurrent] = useState(src || fallback);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={current}
      alt={name}
      loading="lazy"
      className={className}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}
