/**
 * Put text on the clipboard; resolves `false` when nothing could be copied.
 *
 * `navigator.clipboard` exists only in a secure context, so on a plain-HTTP
 * page — the dev server opened at its LAN address on a phone, which is how a
 * friend room is tested on two devices — it is `undefined`, and every copy
 * button failed silently there. The fallback is the old selection +
 * `execCommand("copy")` route, which is deprecated but still works without a
 * secure context in every browser that matters, and only runs when the modern
 * API is missing or refuses.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (permissions, focus) — try the selection route below.
    }
  }
  return copyViaSelection(text);
}

function copyViaSelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  // Read-only keeps a phone from opening its keyboard; off-screen rather than
  // `display: none`, which cannot hold a selection.
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "-1000px";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  // iOS Safari ignores `select()` on its own.
  field.setSelectionRange(0, text.length);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
