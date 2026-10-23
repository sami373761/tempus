import type { Metadata } from "next";

import { ContactEmailText } from "@/components/contact-email";
import { readLocaleContext } from "@/lib/i18n/server";
import { PRIVACY, PRIVACY_UPDATED } from "@/lib/privacy";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await readLocaleContext();
  const doc = PRIVACY[locale];
  return { title: `${doc.title} · Tempus`, description: doc.lead };
}

/**
 * The privacy policy, in the reader's language (lib/privacy.ts).
 *
 * Also the page Google's OAuth consent screen links to, which is why it has a
 * fixed public URL and needs no account.
 *
 * Laid out as the home page's FAQ is — a two-digit index beside each heading
 * and a hairline between entries — so a legal page still reads as part of the
 * site rather than as a pasted document. Narrower than the site column: this
 * is the one page that is nothing but running prose.
 */
export default async function PrivacyPage() {
  const { locale } = await readLocaleContext();
  const doc = PRIVACY[locale];
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${PRIVACY_UPDATED}T00:00:00Z`),
  );

  return (
    <div className="mx-auto max-w-[46rem] px-6 pb-32 pt-12 sm:pt-20">
      <div aria-hidden="true" className="contact-rule h-[2px] w-full" />
      <h1 className="contact-sweep mt-10 text-balance font-display text-[clamp(30px,4.2vw,46px)] font-semibold leading-[1.05] tracking-[-0.03em] sm:mt-14">
        {doc.title}
      </h1>
      <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">{doc.lead}</p>
      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
        {doc.updatedLabel} · <time dateTime={PRIVACY_UPDATED}>{updated}</time>
      </p>

      <ol className="mt-12 border-t border-hairline">
        {doc.sections.map((section, index) => (
          <li key={section.title} className="grid gap-3 border-b border-hairline py-8 sm:grid-cols-[3rem_1fr]">
            <span className="pt-1 text-[11px] font-semibold tabular-nums text-ink-dim">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="text-[17px] font-semibold text-ink">{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[15px] leading-relaxed text-ink-dim">
                  <ContactEmailText text={paragraph} />
                </p>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
