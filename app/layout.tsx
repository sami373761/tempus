import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { readLocale } from "@/lib/i18n/server";

import "./globals.css";

/**
 * One family for the whole site: Inter.
 *
 * It was two — Lora for anything large enough to read as a title, Lato for
 * body copy — until 2026-10-06. Both tokens in globals.css now resolve to
 * Inter, so the `font-display` utility that 19 components already carry stays
 * as a marker for "this is a title" without being a second typeface. Putting a
 * display face back is one line in `--font-display` rather than an edit per
 * heading.
 *
 * `next/font` self-hosts it and emits the `@font-face` rules at build time, so
 * there is no request to Google at runtime. Inter ships as a variable font, so
 * one load covers every weight the UI uses (400 through 700) with no synthetic
 * bolding anywhere.
 *
 * `latin-ext` is not optional: the UI ships in five languages and Turkish
 * alone needs ğ, ş and ı, none of which are in the `latin` subset.
 */
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tempus",
  description: "A historical date-guessing game.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // `lang` has to follow the selected language, not just the page copy.
  const locale = await readLocale();

  return (
    // The font variable goes on `html`, not `body`: `--font-sans` and
    // `--font-display` in globals.css resolve against it, and Tailwind's
    // preflight sets the default family on `html`.
    <html lang={locale} className={inter.variable}>
      {/* No background on the body: an in-flow block's background paints *after*
          negative-z-index descendants, so an opaque one here would hide any
          full-bleed backdrop behind the page (components/timeline-backdrop.tsx).
          `html` carries the page colour instead, and the root element's
          background is propagated to the canvas under everything. */}
      <body className="min-h-dvh font-sans text-ink antialiased">
        {children}
      </body>
    </html>
  );
}
