import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "News_Pond — Tech & AI Tracker",
  description:
    "Live tracker for frontier AI models, languages, and frameworks. Auto-updated daily.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {/* Ambient neon blobs for premium depth (purely decorative) */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-violet-600/20 blur-[120px] animate-pulse-slow" />
          <div className="absolute top-1/3 right-0 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px] animate-pulse-slow" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] animate-pulse-slow" />
        </div>
        <Sidebar />
        <div className="md:pl-60">{children}</div>
      </body>
    </html>
  );
}
