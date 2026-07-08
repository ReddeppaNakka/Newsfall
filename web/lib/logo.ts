/**
 * Best-effort logo for a card. ALWAYS returns an image URL (given a name) so no card
 * is ever blank:
 *   1. explicit image_url → use it
 *   2. homepage_url       → unavatar.io (aggregates favicon / Clearbit / DuckDuckGo /
 *                           etc. into a real logo), with a branded initials tile as its
 *                           own fallback if nothing is found
 *   3. neither            → a branded initials tile (ui-avatars) — a clean, consistent
 *                           image instead of a bare letter
 *
 * Both services are free and need no key. Cards render this via <img> so no next.config
 * change is needed.
 */

/** A generated square avatar with the item's initials — the universal fallback image. */
export function initialsAvatar(name: string): string {
  return (
    "https://ui-avatars.com/api/?" +
    `name=${encodeURIComponent(name)}` +
    "&size=128&bold=true&format=png&length=2&background=141821&color=ffffff"
  );
}

export function logoFor(
  imageUrl: string | null,
  homepageUrl: string | null,
  name?: string | null,
): string | null {
  if (imageUrl) return imageUrl;

  const fallback = name ? initialsAvatar(name) : null;

  if (homepageUrl) {
    try {
      const host = new URL(homepageUrl).hostname.replace(/^www\./, "");
      const fb = fallback ? `?fallback=${encodeURIComponent(fallback)}` : "";
      return `https://unavatar.io/${host}${fb}`;
    } catch {
      /* malformed URL — fall through to the initials tile */
    }
  }

  return fallback;
}
