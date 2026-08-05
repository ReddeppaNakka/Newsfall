import type { Config } from "tailwindcss";

/**
 * Premium dark theme tokens.
 * - canvas: slate/zinc-950 base
 * - accent palette mapped to neon glows (violet / cyan / emerald)
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#08080c", // near-black slate/zinc-950 canvas
      },
      boxShadow: {
        // Neon accent glows used on card hover.
        "glow-violet": "0 0 0 1px rgba(139,92,246,.4), 0 8px 40px -8px rgba(139,92,246,.55)",
        "glow-cyan": "0 0 0 1px rgba(34,211,238,.4), 0 8px 40px -8px rgba(34,211,238,.55)",
        "glow-emerald": "0 0 0 1px rgba(16,185,129,.4), 0 8px 40px -8px rgba(16,185,129,.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-slow": {
          "0%,100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // Mobile nav drawer.
        "slide-in-left": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s ease-out both",
        "pulse-slow": "pulse-slow 6s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out both",
        "slide-in-left": "slide-in-left 0.25s cubic-bezier(0.32, 0.72, 0, 1) both",
      },
      backgroundImage: {
        "grid-faint":
          "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
      },
    },
  },
  plugins: [],
};

export default config;
