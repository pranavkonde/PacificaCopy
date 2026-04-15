import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "PacificaCopy — Luxury Editorial Copy Trading",
  description: "Curated copy trading on Pacifica DEX with live market intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${playfair.variable} antialiased`}>
        <div className="gridline g1" />
        <div className="gridline g2" />
        <div className="gridline g3" />
        <div className="gridline g4" />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
