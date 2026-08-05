import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "News_Pond — Tech & AI Tracker",
  description:
    "Live tracker for frontier AI models, languages, and frameworks. Auto-updated daily.",
};

/**
 * `viewportFit: "cover"` lets the dark canvas run under the notch/home indicator;
 * the `px-safe` / `pb-safe` utilities keep actual content clear of them.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Ambient neon blobs for premium depth (purely decorative).
            Smaller radius + cheaper blur on phones — a 120px blur over three
            384px blobs is a real scroll-jank cost on mid-range mobile GPUs. */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-56 w-56 rounded-full bg-violet-600/20 blur-[70px] animate-pulse-slow sm:h-96 sm:w-96 sm:blur-[120px]" />
          <div className="absolute top-1/3 right-0 h-56 w-56 rounded-full bg-cyan-500/15 blur-[70px] animate-pulse-slow sm:h-96 sm:w-96 sm:blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-emerald-500/10 blur-[70px] animate-pulse-slow sm:h-96 sm:w-96 sm:blur-[120px]" />
        </div>
        <Sidebar />
        <div className="px-safe md:pl-60">{children}</div>
      </body>
    </html>
  );
}
