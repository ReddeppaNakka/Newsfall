"use client";

import { useEffect, useState } from "react";

/** "29 AUG 2026, 11:42 PM IST" — rendered after mount so server and client never disagree. */
export default function LiveClock() {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
      const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      // en-IN yields "IST"-style abbreviations where they exist; fall back to the raw GMT offset.
      const tz = new Intl.DateTimeFormat("en-IN", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
      setText(`${date}, ${time} ${tz}`.trim());
    };
    fmt();
    const id = setInterval(fmt, 30000);
    return () => clearInterval(id);
  }, []);
  return <time className="tabular-nums text-zinc-400" suppressHydrationWarning>{text}</time>;
}
