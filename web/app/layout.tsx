import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// High-contrast editorial serif for the big story and headline typography.
const serif = Instrument_Serif({ subsets: ["latin"], variable: "--font-serif", weight: "400", style: ["normal", "italic"] });

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
  themeColor: "#07080b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${serif.variable} font-sans antialiased`}>
        <Sidebar />
        <div className="px-safe md:pl-[72px]">{children}</div>
      </body>
    </html>
  );
}
