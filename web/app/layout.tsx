import type { Metadata, Viewport } from "next";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Editorial serif for intelligence headlines (cards, event hero).
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "500", "600"], style: ["normal"] });

export const metadata: Metadata = {
  title: "Newsfall — Technology Intelligence",
  description:
    "Evidence-driven technology, industry and influence intelligence: what happened, why it matters, who is involved, and how sure we are.",
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
      <body className={`${inter.variable} ${newsreader.variable} font-sans antialiased`}>
        {/* A single, very faint ambient wash — enough depth to avoid a flat black page,
            restrained enough to read as editorial rather than "AI dashboard". */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/3 h-72 w-72 rounded-full bg-violet-500/[0.06] blur-[90px] sm:h-[28rem] sm:w-[28rem] sm:blur-[140px]" />
        </div>
        <Sidebar />
        <div className="px-safe md:pl-60">{children}</div>
      </body>
    </html>
  );
}
