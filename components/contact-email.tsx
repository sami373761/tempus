import { CONTACT_EMAIL } from "@/lib/contact";

/**
 * A paragraph that names the contact address in the middle of its own
 * sentence, with the `mailto:` dropped into the `{email}` slot.
 *
 * The address is part of the prose rather than a heading above it, which is
 * where the sense of it already was — and the slot is what lets each language
 * decide where in its own sentence it falls. One implementation because two
 * blocks print it now: the home page's contact section and `/contact`.
 *
 * `split` with the slot as the separator rather than an index and two slices,
 * so a translation that forgets the slot renders as plain prose instead of
 * throwing — and one that repeats it gets the link twice rather than silently
 * losing the tail.
 *
 * `break-all` is on the link alone, never on the paragraph: the address is the
 * one word in the sentence with no spaces to wrap at, and the same rule on the
 * whole paragraph would hyphenate ordinary words too.
 *
 * **It is styled as prose, not as a link.** It wore the amber underline the
 * section's rules are drawn in and a `text-ink` weight above the paragraph's
 * `text-ink-dim`, which made the one word in the sentence that is already the
 * point of it louder than the sentence. Colour and weight are inherited now
 * and there is no decoration; it is still an anchor, so the `mailto:` and the
 * focus ring stay.
 */
export function ContactEmailText({ text }: { text: string }) {
  const parts = text.split("{email}");
  return (
    <>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [
              <a
                key={index}
                href={`mailto:${CONTACT_EMAIL}`}
                className="break-all text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                {CONTACT_EMAIL}
              </a>,
              part,
            ],
      )}
    </>
  );
}
