/**
 * Pure helpers for R2 image addressing. Safe to import from client code — no
 * credentials and no AWS SDK are involved.
 *
 * Objects are organised by era, matching the `bce` / `ce` / `future` category
 * slugs:
 *
 *   bce/code-of-hammurabi.webp
 *   ce/beginning-of-world-war-ii.webp
 *   future/first-crewed-mars-landing.webp
 *
 * The folder is derived from the event's year by `eraForYear()`, which mirrors
 * `public.era_slug_for_year()` in the database. Keeping the prefix a function of
 * the year rather than free text means an object's location always agrees with
 * the event's era category.
 */

import { eraForYear, isEraFolder, type EraFolder } from "../historical-date.ts";
import { publicEnv } from "../env.ts";
// Type-only: the backdrop record below is keyed by pane, and importing the type
// rather than the module keeps storage free of any runtime dependency on the game.
import type { TimelinePane } from "../game/timeline.ts";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const SUPPORTED_IMAGE_MIME_TYPES = Object.keys(EXTENSION_BY_MIME);

export function isSupportedImageMimeType(mimeType: string): boolean {
  return mimeType in EXTENSION_BY_MIME;
}

export function extensionForMimeType(mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType];
  if (!extension) throw new Error(`Unsupported image MIME type: ${mimeType}`);
  return extension;
}

/** Base names must be URL-safe and must not smuggle in path separators. */
const FILENAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Builds the canonical R2 object key for an event image:
 *   `<era>/<filename>.<ext>`
 *
 * `filename` is normally the event slug. Pass `variant` to add a second image
 * for the same event without colliding (`ce/waterloo-2.webp`).
 */
export function buildImageObjectKey(options: {
  /** Astronomical year of the event; selects the era folder. */
  year: number;
  /** Slug-shaped base name, no extension and no slashes. */
  filename: string;
  mimeType: string;
  variant?: number;
}): string {
  const { year, filename, mimeType, variant } = options;

  if (!FILENAME.test(filename)) {
    throw new Error(
      `Image filename must be lowercase slug-shaped (got "${filename}")`,
    );
  }
  if (variant !== undefined && (!Number.isInteger(variant) || variant < 2)) {
    throw new Error(`Image variant must be an integer >= 2 (got ${variant})`);
  }

  const base = variant === undefined ? filename : `${filename}-${variant}`;
  return `${eraForYear(year)}/${base}.${extensionForMimeType(mimeType)}`;
}

export interface ParsedImageObjectKey {
  era: EraFolder;
  filename: string;
  extension: string;
  mimeType: string;
}

/**
 * Inverse of `buildImageObjectKey`. Returns null for anything not shaped like
 * `<era>/<filename>.<ext>` — used to reject keys that would sit outside the era
 * folders before they reach the database.
 */
export function parseImageObjectKey(key: string): ParsedImageObjectKey | null {
  const match = /^([a-z]+)\/([a-z0-9-]+)\.([a-z0-9]+)$/.exec(key);
  if (!match) return null;

  const [, era, filename, extension] = match as unknown as [
    string,
    string,
    string,
    string,
  ];
  if (!isEraFolder(era)) return null;
  if (!FILENAME.test(filename)) return null;

  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) return null;

  return { era, filename, extension, mimeType };
}

/**
 * Public URL for a stored object. The bucket is fronted by a Cloudflare domain
 * (or the r2.dev dev domain) configured via NEXT_PUBLIC_R2_PUBLIC_BASE_URL, so
 * images are served straight from the CDN and never proxied through Next.js.
 */
export function publicImageUrl(objectKey: string): string {
  return `${publicEnv.r2PublicBaseUrl}/${objectKey.replace(/^\/+/, "")}`;
}

/**
 * Decorative site artwork. These keys deliberately sit outside the era folders
 * — the photos belong to no event, so `parseImageObjectKey()` rejects them and
 * they never get an `image` row. Uploaded by hand, not by `attach-image`.
 */
export const HOMEPAGE_HERO_OBJECT_KEYS = [
  "homepage/collesium2.jpeg",
  "homepage/collesium3.jpeg",
] as const;

/** One of the homepage hero photos, chosen per call. */
export function randomHomepageHeroUrl(): string {
  const keys = HOMEPAGE_HERO_OBJECT_KEYS;
  const key = keys[Math.floor(Math.random() * keys.length)] ?? keys[0];
  return publicImageUrl(key);
}

/**
 * Backdrop photography for the date-guessing game, one per timeline pane.
 *
 * Decorative like the homepage heroes: these belong to no event, so they sit
 * outside the era folders and `parseImageObjectKey()` rejects their keys by
 * design. Uploaded by hand, not by `attach-image`.
 *
 * **A key says nothing about which pane shows it.** Most were uploaded under
 * the names they arrived with (`game-backgrounds-00N`, `siyah_perde_8K`), so
 * this map is the only place the pairing is written down — the ones that match
 * their pane's slug do so by history, not by rule. Renaming an object in the
 * bucket to match its pane means regenerating its derived widths, which is why
 * they are left alone.
 *
 * The folder travels with the base name because a plate does not have to live
 * under `date-guessing-game/`: the film & television pane wears art uploaded
 * for that game under its own prefix, and a pane's plate is a pair of strings
 * precisely so the next one can come from wherever it was uploaded. A folder
 * new to this list has to be added to the dev proxy as well
 * (app/api/r2/[...key]/route.ts), or it fails exactly like a missing object.
 *
 * A pane with no photo is not representable: the record is total, so adding a
 * pane forces a plate rather than silently falling back to black.
 */
interface BackdropPlate {
  /** R2 prefix, no trailing slash. */
  folder: string;
  /** Object name without the `-<width>.jpg` the derivatives carry. */
  base: string;
}

const TIMELINE_BACKDROP_PLATES: Record<TimelinePane, BackdropPlate> = {
  cosmos: { folder: "date-guessing-game", base: "cosmos" },
  evolution: { folder: "date-guessing-game", base: "game-backgrounds-003" },
  civilization: { folder: "date-guessing-game", base: "game-backgrounds-002" },
  ce: { folder: "date-guessing-game", base: "game-backgrounds-001" },
  // The football rail covers 1850–2026, which sits wholly inside the common
  // era, so until a plate of its own is uploaded it wears the common era's —
  // art the site already has, which is the rule the explorer's stage follows
  // too. The bucket's only football photography is `homepage/football.jpeg`, a
  // 736x1308 phone shot: a portrait a fifth of the width a full-bleed backdrop
  // is stored at, so deriving a 1440/2560 pair from it would be upscaling a
  // crop. Giving football its own plate is this one line plus
  // `npm run backdrops:derive`; the pane's wash in
  // components/timeline-backdrop.tsx is already its own.
  football: { folder: "date-guessing-game", base: "game-backgrounds-001" },
  // The basketball rail covers 1875–2026, which like football's sits wholly
  // inside the common era, so it wears the common era's plate until one of its
  // own is uploaded — art the site already has, which is the rule football's
  // pane and the explorer's stage both follow. The bucket's only basketball
  // photography is `homepage/basketball.jpg`, the master the board's card was
  // cut from, and at 2047x1803 it is narrower than the 2560 a full-bleed
  // backdrop is stored at — so the pair derived from it would be upscaled at
  // the width that matters. Giving this pane its own plate is this one line plus
  // `npm run backdrops:derive`; its wash in components/timeline-backdrop.tsx
  // is already its own.
  basketball: { folder: "date-guessing-game", base: "game-backgrounds-001" },
  // The film & television pane has its own plate: a black cinema curtain,
  // uploaded under `film-dizi/` with the posters it belongs with. It is not a
  // photograph of anything — which is the point. The subject's own imagery is
  // all stills and posters under copyright (the bucket's `homepage/movies-1.jpg`
  // is one, see CLAUDE.md's known gaps), so the room this game plays in is the
  // auditorium rather than the picture: drawn art, cleared by being drawn, and
  // near enough black that the posters on it are the only lit thing on screen.
  screen: { folder: "film-dizi", base: "siyah_perde_8K" },
  // The "Born When?" game's three rails, which share two of the general
  // timeline's own plates rather than bringing art of their own — the rule
  // football's pane already follows, and for a better reason here: these panes
  // *are* stretches of history (1500 BCE to 1 BCE, AD 1 to 1500, 1500 to now)
  // rather than a subject, so the plates that stand for antiquity and for
  // recorded history are the right pictures and not a stand-in for a missing
  // one.
  //
  // So the antiquity rail wears the civilisation pane's photograph and the two
  // common-era rails wear the common era's, which also means the crossfade
  // between the second and third rails is a hold rather than a dissolve: the
  // seam at 1500 is a change of scale, not a change of era, and nothing behind
  // it should move. The one visible transition is the pan across the 1 BCE
  // hinge, which is exactly where a player *has* crossed into another age.
  //
  // Both plates already have their 1440/2560 derivatives in the bucket, so
  // this game needs no `backdrops:derive` run. Giving any of the three a plate
  // of its own is one line here plus that command; each pane's wash in
  // components/timeline-backdrop.tsx is already its own.
  "born-antiquity": { folder: "date-guessing-game", base: "game-backgrounds-002" },
  "born-premodern": { folder: "date-guessing-game", base: "game-backgrounds-001" },
  "born-modern": { folder: "date-guessing-game", base: "game-backgrounds-001" },
};

/**
 * Widths every full-bleed backdrop is stored at, smallest first.
 *
 * The masters are 24-megapixel camera files of several megabytes. A browser
 * caches the *decoded* bitmap rather than the JPEG, so one of those full-bleed
 * is ~100MB of texture and the date-guessing game — which can have three alive
 * at once mid-crossfade — flickered to black as Chrome evicted and re-decoded
 * them. These derived widths are what the pages actually load, through a
 * `sizes="100vw"` srcset that still picks 2560 on a wide retina screen;
 * `<base>.jpg` stays in the bucket as the master.
 *
 * **Nothing falls back to the master.** A page whose derivatives are missing
 * requests URLs that 404 and shows no photograph at all, so these are not
 * redundant low-resolution copies — deleting one breaks the page that names it.
 * `npm run backdrops:derive -- --prefix <folder>/` regenerates any that are
 * missing, and any new backdrop needs its pair generated the same way.
 */
export const BACKDROP_WIDTHS = [1440, 2560] as const;

export type BackdropWidth = (typeof BACKDROP_WIDTHS)[number];

/** Largest stored width — the `src` a browser falls back to without `srcset`. */
const WIDEST = BACKDROP_WIDTHS[BACKDROP_WIDTHS.length - 1]!;

/** `<folder>/<base>-<width>.jpg`, the shape every backdrop derivative has. */
function backdropObjectKey(
  folder: string,
  base: string,
  width: BackdropWidth,
): string {
  return `${folder}/${base}-${width}.jpg`;
}

function backdropSrcSet(folder: string, base: string): string {
  return BACKDROP_WIDTHS.map(
    (width) =>
      `${publicImageUrl(backdropObjectKey(folder, base, width))} ${width}w`,
  ).join(", ");
}

/** Object key for one pane's backdrop at one of the stored widths. */
export function timelineBackdropObjectKey(
  pane: TimelinePane,
  width: BackdropWidth,
): string {
  const { folder, base } = TIMELINE_BACKDROP_PLATES[pane];
  return backdropObjectKey(folder, base, width);
}

export function timelineBackdropUrl(pane: TimelinePane): string {
  return publicImageUrl(timelineBackdropObjectKey(pane, WIDEST));
}

/** All stored widths, for a full-bleed `sizes="100vw"` backdrop. */
export function timelineBackdropSrcSet(pane: TimelinePane): string {
  const { folder, base } = TIMELINE_BACKDROP_PLATES[pane];
  return backdropSrcSet(folder, base);
}

/**
 * Backdrop photography for the comparison game.
 *
 * One photograph for the whole game rather than one per era: the comparison
 * round spans two anchors that can sit in any two eras at once, so there is no
 * single era for the backdrop to illustrate. The cosmos plate was chosen for
 * exactly that reason — it is the one view that belongs to no period.
 *
 * It lives under its own `comparison-game/` prefix, uploaded by hand like the
 * other decorative art, so `parseImageObjectKey()` rejects the key by design.
 * It is byte-identical to the date-guessing game's cosmos plate today; keeping
 * a separate copy is deliberate, so re-dressing one game cannot silently
 * re-dress the other.
 */
const COMPARISON_BACKDROP_BASE_NAME = "cosmos";

export function comparisonBackdropUrl(): string {
  return publicImageUrl(
    backdropObjectKey("comparison-game", COMPARISON_BACKDROP_BASE_NAME, WIDEST),
  );
}

export function comparisonBackdropSrcSet(): string {
  return backdropSrcSet("comparison-game", COMPARISON_BACKDROP_BASE_NAME);
}

/**
 * Cover photography for the two homepage game cards.
 *
 * Decorative like the heroes and the timeline backdrops — they belong to no
 * event, so `parseImageObjectKey()` rejects their keys by design.
 *
 * Each card has exactly two photos and the pair is swapped once a day (see
 * `dailyGameCoverIndex`), so the record is a fixed-length tuple: a third photo
 * would have to come with a decision about what "alternates daily" means, and
 * the type forces that rather than silently ignoring it.
 */
const GAME_COVER_BASE_NAMES: Record<GameCard, readonly [string, string]> = {
  comparison: ["comparison-game-cover-1", "comparison-game-cover-2"],
  guess: ["date-guessing-game-cover-1", "date-guessing-game-cover-2"],
};

export type GameCard = "comparison" | "guess";

/**
 * Widths each cover is stored at, smallest first.
 *
 * Same lesson as the timeline backdrops: the uploaded masters are 4K camera
 * files, up to 13MB each, and a browser caches the *decoded* bitmap. The cards
 * are at most ~370 CSS px wide, so 800 covers 2x and 1600 covers a wide
 * retina layout. The masters stay in the bucket untouched.
 */
export const GAME_COVER_WIDTHS = [800, 1600] as const;

function gameCoverObjectKey(
  card: GameCard,
  photo: 0 | 1,
  width: (typeof GAME_COVER_WIDTHS)[number],
): string {
  return `homepage/${GAME_COVER_BASE_NAMES[card][photo]}-${width}.jpg`;
}

/** Largest stored width — the `src` a browser falls back to without `srcset`. */
export function gameCoverUrl(card: GameCard, photo: 0 | 1): string {
  const widest = GAME_COVER_WIDTHS[GAME_COVER_WIDTHS.length - 1]!;
  return publicImageUrl(gameCoverObjectKey(card, photo, widest));
}

/** All stored widths, for a card that fills its own column. */
export function gameCoverSrcSet(card: GameCard, photo: 0 | 1): string {
  return GAME_COVER_WIDTHS.map(
    (width) =>
      `${publicImageUrl(gameCoverObjectKey(card, photo, width))} ${width}w`,
  ).join(", ");
}

/**
 * The photographs the board's cards are dressed in — both views.
 *
 * Decorative like everything else under `homepage/`, so `parseImageObjectKey()`
 * rejects these keys by design. Each is cut from a hand-uploaded master that
 * stays in the bucket beside it, named here so a recrop knows what to go back
 * to.
 *
 * **One file each and no srcset**, unlike the two cover cards above. These
 * cards are at most a third of the board wide (~400 CSS px at the cap), so a
 * single file covers every device that will ever ask for one, and a second
 * width would mostly ship bytes no browser would pick. The cover cards are
 * half the board and do carry a pair.
 *
 * The two shapes are not a style choice, they are the grids:
 *
 * - **Square, 512px** for a games-view card. That view is four columns and
 *   every card is a quarter of the board both ways, so the card is square at
 *   every width (~296 CSS px at the cap, ~155 on a phone) and the photo is
 *   square in the *file* — `object-cover` is left with nothing to crop, which
 *   is what lets each crop be a judgement about its own picture rather than a
 *   centred rule. The football master is a 736x1308 phone shot whose centred
 *   crop clips the ball and the boots.
 * - **Landscape, 800x450** for a play-view tile. Those are *not* one shape: a
 *   tile is 400x296 above `md` and square under it, and the one spanning the
 *   full width of the two-column layout is wider still. No single file can be
 *   pre-cropped for that, so these keep their 16/9 and let `object-cover` take
 *   the sides off — which is safe because all three are centred compositions.
 *   800 is what the widest case actually consumes: at 400 CSS px the cover
 *   scale puts 778 source pixels behind the visible box, so 800 is 2x there.
 *
 * `sips` is the whole toolchain, the same one the backdrops' derivatives use:
 *
 *   sips --cropOffset 346 0  --cropToHeightWidth 736 736   football.jpeg  --out f.jpg
 *   sips --cropOffset 0 122  --cropToHeightWidth 1803 1803 basketball.jpg --out b.jpg
 *   sips --cropOffset 0 840  --cropToHeightWidth 2160 2160 movies-1.jpg   --out m.jpg
 *   sips --cropToHeightWidth 2700 2700 arka-4.png --out s.jpg   # centred
 *   sips --cropOffset 0 640  --cropToHeightWidth 1693 1693 invention.jpg  --out i.jpg
 *   sips --cropOffset 0 380  --cropToHeightWidth 1067 1067 when-born.jpg  --out w.jpg
 *   sips --cropOffset 0 170  --cropToHeightWidth 782 782   coming-soon.jpg --out c.jpg
 *   sips --resampleWidth 512 <each square> --out <each>
 *   sips -s format jpeg -s formatOptions 85 --resampleWidth 800 <flag-1|arka-2> --out <tile>
 *
 * `--cropOffset` is `<y> <x>`, which is why every landscape master above moves
 * its crop with the second number. The last three are off-centre on purpose:
 * the bulb's filament sits right of centre in its frame and the statue's face
 * right of centre in its, so a centred square would have cut the subject of
 * each in half; the coming-soon still is two subjects at once — a mechanism
 * and the figure working on it — so its offset is the one that keeps both
 * rather than the one that centres either.
 */
export type BoardPhoto =
  | "versus"
  | "compare"
  | "other"
  | "survival"
  | "football"
  | "basketball"
  | "screen"
  | "invention"
  | "whenBorn"
  | "comingSoon";

/**
 * Master -> card, so the source of each crop is written down next to it.
 *
 * `other-games-card.jpg` is the one that is not a derivative: `arka-3.jpg` is
 * 300x200 as uploaded, which is already smaller than the card it fills, so
 * resampling it could only add pixels that are not in the picture. It is a
 * copy under the card's own name rather than a reference to the master, so
 * re-dressing that card stays a question of what is in the bucket.
 */
const BOARD_PHOTO_OBJECT_KEYS: Record<BoardPhoto, string> = {
  // homepage/flag-1.jpg — heraldic banners, two lions facing each other.
  versus: "homepage/versus-card.jpg",
  // homepage/arka-2.jpg — rock formations seen through an arch.
  compare: "homepage/compare-card.jpg",
  // homepage/arka-3.jpg, at its uploaded size. See above.
  other: "homepage/other-games-card.jpg",
  // homepage/arka-4.png — the rider of the Moscow arms, centred square crop.
  survival: "homepage/survival-card.jpg",
  football: "homepage/football-card.jpg",
  basketball: "homepage/basketball-card.jpg",
  // The master this was cut from is `homepage/movies-1.jpg`; the card is
  // "Film & TV" and `screen` is what the board calls it.
  screen: "homepage/screen-card.jpg",
  // The last three masters are the only ones not under `homepage/`: they were
  // uploaded to prefixes of their own — `invention/invention.jpg` (a filament
  // bulb), `when-born/when-born.webp` (the Confucius statue) and
  // `coming-soon/coming-soon.jpg`. The cards cut from them live here with every
  // other card, so the board stays one prefix and the dev proxy needs no new
  // entry.
  invention: "homepage/invention-card.jpg",
  whenBorn: "homepage/when-born-card.jpg",
  // The card for the modes that have no name yet, which is why it was the last
  // bare one on the board.
  comingSoon: "homepage/coming-soon-card.jpg",
};

/**
 * The 3D model the explorer's stage shows while nothing is open — a
 * photogrammetry scan of a Macedonian tetradrachm, hand-uploaded under its own
 * `3d-models/` prefix like every other decorative asset, so
 * `parseImageObjectKey()` rejects the key by design.
 *
 * It replaced the Colosseum video loop on 2026-10-07. That film stays in the
 * bucket under `videos/` and nothing reads it any more; what is here instead is
 * an object the game is about rather than a plate that suggests the period.
 *
 * **The GLB requires three extensions, and "requires" is literal**:
 * `EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp` are
 * all in `extensionsRequired`, so a loader missing any of them throws instead of
 * degrading. Only Meshopt needs wiring up by hand — see
 * `components/explorer-coin.tsx`.
 *
 * **`3d-models/` and `.glb` had to be added to the dev proxy**
 * (`app/api/r2/[...key]`), and a missing prefix there looks exactly like a
 * missing object. See CLAUDE.md.
 */
export function explorerModel(): string {
  return publicImageUrl("3d-models/tetradrachme_uit_macedonia-v1.glb");
}


/**
 * The survival photograph at a width the explorer's stage can use. Derived from
 * `homepage/arka-4.png` exactly as `survival-card.jpg` was, only larger:
 *
 *   sips --cropToHeightWidth 2700 2700 arka-4.png --out s.jpg
 *   sips -s format jpeg -s formatOptions 85 --resampleWidth 1600 s.jpg --out s.jpg
 *
 * One width rather than a pair: the stage is ~690 CSS px and this covers it at
 * 2x, and a second file would only be chosen on screens that are narrower than
 * the card it is already too big for.
 */
const SURVIVAL_STAGE_OBJECT_KEY = "homepage/survival-stage-1600.jpg";

export function boardPhotoUrl(card: BoardPhoto): string {
  return publicImageUrl(BOARD_PHOTO_OBJECT_KEYS[card]);
}

/** Every board photograph, keyed as the board names them. */
export function boardPhotos(): Record<BoardPhoto, string> {
  return Object.fromEntries(
    Object.keys(BOARD_PHOTO_OBJECT_KEYS).map((card) => [
      card,
      boardPhotoUrl(card as BoardPhoto),
    ]),
  ) as Record<BoardPhoto, string>;
}

/**
 * The artwork the home page's explorer puts on its stage — one entry per pill
 * that has a picture behind it.
 *
 * **Nothing new is uploaded for it.** Every key here is already in the bucket
 * for something else: the two game covers (the comparison pair had gone unused
 * when that card lost its photograph), four of the board's card photographs,
 * and the pattern the prose card used before the explorer replaced it. The
 * explorer is a second reading of the art the site already has, which is why
 * this is an assembly rather than a new `Record` of keys.
 *
 * `srcSet` is present only where a pair of widths actually exists. The stage is
 * ~690 CSS px at the cap, so the 800/1600 covers are worth a hint and the
 * board's single-width squares — which were cut for a card a third that size —
 * have nothing to choose between. They are shown small here, each a third of
 * the stage in the three-panel subject view, for exactly that reason.
 *
 * Survival is the exception and has a file of its own, because it is the one
 * board photograph the explorer shows *full-bleed*. `survival-card.jpg` is
 * 512px square for a card that is 265px wide; across a 690px stage it would be
 * upscaled on every screen and twice over on a retina one. This is the same
 * master (`homepage/arka-4.png`, 4800x2700), cropped square the same way and
 * resampled to 1600 instead of 512.
 */
export type ExplorerArt =
  | "guess"
  | "compare"
  | "survival"
  | "football"
  | "basketball"
  | "screen"
  | "pattern";

export type ExplorerImage = { src: string; srcSet?: string };

export function explorerArt(): Record<ExplorerArt, ExplorerImage> {
  const guess = dailyGameCoverIndex("guess");
  const compare = dailyGameCoverIndex("comparison");

  return {
    guess: {
      src: gameCoverUrl("guess", guess),
      srcSet: gameCoverSrcSet("guess", guess),
    },
    compare: {
      src: gameCoverUrl("comparison", compare),
      srcSet: gameCoverSrcSet("comparison", compare),
    },
    survival: { src: publicImageUrl(SURVIVAL_STAGE_OBJECT_KEY) },
    football: { src: boardPhotoUrl("football") },
    basketball: { src: boardPhotoUrl("basketball") },
    screen: { src: boardPhotoUrl("screen") },
    pattern: { src: aboutArtUrl(), srcSet: aboutArtSrcSet() },
  };
}

/**
 * The pattern on the home page's explorer, and on the prose card before it.
 *
 * Decorative like everything else under `homepage/`, so `parseImageObjectKey()`
 * rejects the key by design. It is a textile repeat rather than a photograph of
 * anything, which is why the card crops it with `object-cover` without a word
 * about the crop: there is no subject in it to clip.
 *
 * Two derived widths rather than the backdrops' 1440/2560 pair, for the same
 * reason the game covers stop at 1600: this picture is at most half of a
 * `--board-w` card, so 800 covers it at 1x and 1600 at 2x and nothing wider
 * would ever be chosen. The 7MB master stays in the bucket untouched.
 *
 *   npm run backdrops:derive -- --key homepage/pattern.jpg --widths 800,1600
 */
export const ABOUT_ART_WIDTHS = [800, 1600] as const;

function aboutArtObjectKey(width: (typeof ABOUT_ART_WIDTHS)[number]): string {
  return `homepage/pattern-${width}.jpg`;
}

/** Largest stored width — the `src` a browser falls back to without `srcset`. */
export function aboutArtUrl(): string {
  return publicImageUrl(
    aboutArtObjectKey(ABOUT_ART_WIDTHS[ABOUT_ART_WIDTHS.length - 1]!),
  );
}

export function aboutArtSrcSet(): string {
  return ABOUT_ART_WIDTHS.map(
    (width) => `${publicImageUrl(aboutArtObjectKey(width))} ${width}w`,
  ).join(", ");
}

/**
 * The art behind the "play a friend" card, on the head-to-head screen and in
 * the home page's 1v1 window.
 *
 * Decorative like everything else outside the era folders, under a prefix of
 * its own (`1v1/`) — which had to be added to the dev proxy
 * (app/api/r2/[...key]/route.ts) as well, or it fails exactly like a missing
 * object.
 *
 * **It is a repeat, not a photograph**, so it needs no crop and reads the same
 * at any size — the same kind of art as `homepage/pattern.jpg`, and it is
 * handled the same way: one derived width rather than the uploaded master.
 * The master is 2752x1536 and 2.4MB, which is several times what a card ever
 * shows; 1600 covers the widest the card can be (the page's ~1024px column at
 * 2x would be the only thing to ask for more, and this is a flat pattern on
 * black where the difference is invisible).
 *
 *   npm run backdrops:derive -- --key 1v1/1v1.jpeg --widths 1600
 *
 * One file and no `srcSet` because the card paints it as a CSS background like
 * the online card's own picture — a background takes one URL, and the two
 * cards stand side by side and so load their art the same way.
 */
const VERSUS_FRIEND_ART_OBJECT_KEY = "1v1/1v1-1600.jpg";

export function versusFriendArtUrl(): string {
  return publicImageUrl(VERSUS_FRIEND_ART_OBJECT_KEY);
}

/**
 * Which of a card's two photos today gets.
 *
 * The brief is "random daily, but never the same two days running". With only
 * two photos per card those two requirements leave no freedom: the only
 * sequence that never repeats is strict alternation, so this is a parity on the
 * day number rather than a seeded shuffle. Randomness would have to repeat.
 *
 * The two cards are offset by one so the homepage never shows both first
 * photos and then both second ones — the pair reads as a new combination each
 * day even though each card is only alternating.
 *
 * Days are counted in UTC, matching `formatYear()`'s choice elsewhere: the
 * render happens on the server, and a fixed zone is what keeps every visitor
 * on the same photo. The swap therefore lands at 03:00 in Istanbul, not
 * midnight.
 */
export function dailyGameCoverIndex(
  card: GameCard,
  now: Date = new Date(),
): 0 | 1 {
  const dayNumber = Math.floor(now.getTime() / 86_400_000);
  const offset = card === "comparison" ? 0 : 1;
  return ((dayNumber + offset) % 2) as 0 | 1;
}
