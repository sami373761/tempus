import type { Metadata } from "next";
import { Lato, Lora } from "next/font/google";

import { readLocale } from "@/lib/i18n/server";

import "./globals.css";

/**
 * Two families, split by size: Lora sets the headings and anything large enough
 * to read as a title, Lato sets body copy and everything smaller.
 *
 * `next/font` self-hosts both and emits the `@font-face` rules at build time,
 * so there is no request to Google at runtime.
 *
 * `latin-ext` is not optional here: the UI ships in five languages and Turkish
 * alone needs ğ, ş and ı, none of which are in the `latin` subset.
 */
const lora = Lora({
  subsets: ["latin", "latin-ext"],
  variable: "--font-lora",
  display: "swap",
});

/**
 * Lato has no 600, and plenty of body-sized text is `font-semibold` — the
 * buttons, the marker's year bubble. Shipping 700 keeps those from being
 * synthetically emboldened off the 400.
 */
const lato = Lato({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-lato",
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
    // The font variables go on `html`, not `body`: `--font-sans` and
    // `--font-display` in globals.css resolve against them, and Tailwind's
    // preflight sets the default family on `html`.
    <html lang={locale} className={`${lora.variable} ${lato.variable}`}>
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
