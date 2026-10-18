/**
 * Builds the online head-to-head's bot name pool from a plain wordlist.
 *
 *   npm run bot:names -- --source ~/Desktop/bot_usernames.txt
 *   npm run bot:names -- --dry-run        # report only, write nothing
 *
 * Writes `lib/game/bot-name-pool.ts`, which lib/game/bot-names.ts folds into
 * `BOT_NAMES`. Run it again only to rebuild the pool: the output is committed,
 * and because a name is reserved the moment a bot wears it
 * (`reserved_username`), dropping a name from the pool does not give it back.
 *
 * **Half the pool is worn as found, half is decorated.** A pool of nothing but
 * dictionary words would read as a dictionary — ten rounds against "aardwolf"
 * and "zygote" is a tell on its own — so `DECORATED` of the drawn names get
 * the things people actually append to a handle: a couple of digits, a birth
 * year, an initial, a second word, a country tag. The decorations are drawn
 * from the same CSPRNG as everything else about a bot.
 *
 * **The filter is the username column's own**, `[a-z0-9_]` and 3–20 characters
 * (`normalizeUsername`), with a floor of `MIN_WORD` so the pool is not full of
 * three-letter stubs, minus a blocklist: a stand-in opponent must be a name
 * nobody minds seeing on their screen for ten rounds, and nothing that could
 * pass for the site itself. Over-blocking costs nothing at this size.
 */

import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const POOL_SIZE = 8_000;
const DECORATED = 4_000;

/** Shortest word taken from the source. The column allows 3; a pool of
 *  three-letter dictionary stubs ("aam", "ait") reads as a word list. */
const MIN_WORD = 4;

/**
 * Longest word taken from the source, well under the column's 20. Handles are
 * short because people type them: "acetophenetidin" is a valid username and a
 * name nobody has ever chosen, and a pool with a few hundred of them in it
 * reads as what it is — a dictionary. Decorations may still take a name up to
 * `MAX_NAME`.
 */
const MAX_WORD = 12;
const MAX_NAME = 20;

const DEFAULT_SOURCE = path.join(homedir(), "Desktop", "bot_usernames.txt");
const OUT_FILE = path.join(process.cwd(), "lib", "game", "bot-name-pool.ts");

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Blocked as a whole word only. Every one of these is a substring of something
 * innocent — "ass" of "assembly", "coon" of "raccoon", "rape" of "grape" — so
 * matching them loosely would thin the pool for nothing.
 */
const BLOCKED_WORDS = new Set([
  "anal", "anus", "arse", "ass", "asses", "bastard", "bitch", "bollocks",
  "boner", "boob", "boobs", "bugger", "bum", "butt", "chink", "cock", "coon",
  "crap", "cum", "dago", "dick", "dildo", "dong", "douche", "dyke", "fag",
  "fanny", "feces", "fetus", "gook", "hell", "hoe", "homo", "honky", "incest",
  "jap", "jiz", "jizz", "kike", "kraut", "lesbo", "negro", "nude", "orgy",
  "paki", "pecker", "penis", "pimp", "piss", "poop", "porn", "prick", "pube",
  "pubes", "puke", "pussy", "queer", "rape", "scat", "screw", "scrotum",
  "semen", "sex", "sexy", "slut", "smut", "sperm", "spic", "suck", "tit",
  "tits", "turd", "twat", "urine", "vagina", "wank", "whore", "wop",
  // Nothing that could pass for the site, a role on it, or a thing that is
  // not a player: a name like "tempus_mod" opposite a host is a different
  // kind of lie from the one a stand-in opponent is allowed to tell.
  "admin", "administrator", "anonymous", "bot", "guest", "moderator", "mod",
  "null", "official", "owner", "robot", "root", "staff", "support", "sysop",
  "system", "tempus", "test", "undefined",
]);

/** Blocked anywhere in the word: distinctive enough that a hit is the word. */
const BLOCKED_PARTS = [
  "admin", "cunt", "fag", "fuck", "fuk", "hitler", "jihad", "kkk", "molest",
  "nazi", "nigg", "pedo", "rapist", "retard", "shit", "slave", "sperm",
  "suicide", "testicl", "vagin", "whore",
];

/**
 * Words that are nothing worse than grim, blocked whole: nobody is owed a
 * cheerful opponent, but "killing_07" sitting opposite a player for ten rounds
 * is a name the site chose for them, and it costs nothing to choose another.
 */
const BLOCKED_GRIM = new Set([
  "cadaver", "cocaine", "corpse", "genocide", "heroin", "killer", "killing",
  "manslaughter", "massacre", "murder", "murderer", "slaughter", "slayer",
  "torture",
]);

/* ---------------------------------------------------------------------------
   Draw
   --------------------------------------------------------------------------- */

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const source = valueOf("--source") ?? DEFAULT_SOURCE;

/** Every usable word in the source, shuffled. Module-level because the
 *  "second word" decorations draw their other half from it. */
let words: string[] = [];

function main(): void {
  words = readWords(source);
  if (words.length < POOL_SIZE) {
    fail(`${source} has only ${words.length} usable words, need ${POOL_SIZE}`);
  }

  shuffle(words);
  const drawn = words.slice(0, POOL_SIZE);
  const spare = words.slice(POOL_SIZE);

  // The pool is a set as it is built: a decoration that lands on a name
  // already in it is retried, so the file never carries the same name twice
  // (the seating draw assumes distinct names, and check-versus-bot.ts asserts
  // it).
  const pool = new Set<string>();
  for (const word of drawn.slice(DECORATED)) pool.add(word);

  const styleUse = new Map<string, number>();
  for (const word of drawn.slice(0, DECORATED)) {
    pool.add(decorate(word, pool, styleUse));
  }

  // A decoration can collide its way onto a name already drawn; top up from
  // the spare words so the pool is exactly POOL_SIZE however the draws fell.
  for (const word of spare) {
    if (pool.size >= POOL_SIZE) break;
    pool.add(word);
  }

  const names = [...pool].sort();
  if (names.length !== POOL_SIZE) fail(`built ${names.length} names, expected ${POOL_SIZE}`);
  for (const name of names) {
    if (!USERNAME_RE.test(name)) fail(`"${name}" is not a valid username`);
  }

  report(names, styleUse);
  if (!dryRun) {
    writeFileSync(OUT_FILE, render(names), "utf8");
    console.log(`\nwrote ${path.relative(process.cwd(), OUT_FILE)}`);
  }
}

/* ---------------------------------------------------------------------------
   Decoration
   --------------------------------------------------------------------------- */

/**
 * One handle built from `word`, in the shape of something a person would type.
 *
 * Styles are weighted rather than uniform because handles are: a trailing
 * number and an initial are what most decorated names look like, a country tag
 * or a "the_" prefix is a garnish. A style whose result would overrun the
 * column, or land on a name already drawn, is simply redrawn — with twenty
 * attempts and a last resort that cannot collide twice.
 */
function decorate(word: string, taken: ReadonlySet<string>, use: Map<string, number>): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const style = pickStyle();
    const made = style.build(word);
    if (made && made.length <= MAX_NAME && USERNAME_RE.test(made) && !taken.has(made)) {
      use.set(style.name, (use.get(style.name) ?? 0) + 1);
      return made;
    }
  }
  // Four digits always fit a word that passed MIN_WORD..MAX_NAME-4, and the
  // 10_000 of them cannot all be taken by one word.
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const made = `${word.slice(0, MAX_NAME - 4)}${1_000 + attempt}`;
    if (!taken.has(made)) {
      use.set("fallback", (use.get("fallback") ?? 0) + 1);
      return made;
    }
  }
  fail(`nothing left to decorate "${word}" with`);
}

interface Style {
  name: string;
  weight: number;
  build: (word: string) => string | null;
}

/** Years a player would put in a handle: a birth year, not a timestamp. */
const BIRTH_YEAR_FROM = 1962;
const BIRTH_YEAR_TO = 2011;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const TAGS = ["tr", "de", "fr", "es", "uk", "us", "nl", "it", "pl", "br"];
const PREFIXES = ["the", "mr", "ms", "dr", "its", "im", "not"];

const STYLES: readonly Style[] = [
  // "quietfox88" — the commonest decorated handle there is.
  { name: "two digits", weight: 20, build: (w) => `${w}${randomInt(10, 100)}` },
  { name: "one digit", weight: 6, build: (w) => `${w}${randomInt(1, 10)}` },
  { name: "birth year", weight: 9, build: (w) => `${w}${randomInt(BIRTH_YEAR_FROM, BIRTH_YEAR_TO + 1)}` },
  { name: "padded number", weight: 5, build: (w) => `${w}_0${randomInt(1, 10)}` },
  { name: "underscore digits", weight: 9, build: (w) => `${w}_${randomInt(10, 1_000)}` },
  // "sam_r" — a first name and an initial, the shape half the real ones take.
  { name: "initial", weight: 14, build: (w) => `${w}_${letter()}` },
  { name: "double initial", weight: 4, build: (w) => `${w}_${letter()}${letter()}` },
  // "mossy_stone" — a second word from the same list.
  { name: "second word", weight: 13, build: (w) => join(w, pick(words)) },
  { name: "leading word", weight: 6, build: (w) => join(pick(words), w) },
  { name: "prefix", weight: 5, build: (w) => join(pick(PREFIXES), w) },
  { name: "country tag", weight: 5, build: (w) => join(w, pick(TAGS)) },
  { name: "trailing underscore", weight: 4, build: (w) => `${w}_` },
];

const WEIGHT_TOTAL = STYLES.reduce((sum, style) => sum + style.weight, 0);

function pickStyle(): Style {
  let ticket = randomInt(0, WEIGHT_TOTAL);
  for (const style of STYLES) {
    ticket -= style.weight;
    if (ticket < 0) return style;
  }
  return STYLES[STYLES.length - 1]!;
}

/** `a_b`, or null when the column could not hold it — the caller redraws. */
function join(a: string, b: string): string | null {
  const made = `${a}_${b}`;
  return made.length <= MAX_NAME ? made : null;
}

function letter(): string {
  return LETTERS[randomInt(0, LETTERS.length)]!;
}

function pick<T>(from: readonly T[]): T {
  return from[randomInt(0, from.length)]!;
}

/* ---------------------------------------------------------------------------
   Source, output, reporting
   --------------------------------------------------------------------------- */

function readWords(file: string): string[] {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ${file} — pass --source <wordlist>`);
  }

  const seen = new Set<string>();
  let skipped = 0;
  let blocked = 0;

  for (const raw of text.split(/\r?\n/)) {
    const word = raw.trim().toLowerCase();
    if (!word) continue;
    // The source is reported on, never fixed up: a line with a character the
    // column cannot hold ("amélie") is a line this pool has no use for, and
    // folding it would invent a name nobody wrote.
    if (word.length < MIN_WORD || word.length > MAX_WORD || !USERNAME_RE.test(word)) {
      skipped += 1;
      continue;
    }
    if (isBlocked(word)) {
      blocked += 1;
      continue;
    }
    seen.add(word);
  }

  console.log(
    `source ${path.relative(process.cwd(), file) || file}: ` +
      `${seen.size} usable, ${skipped} unusable, ${blocked} blocked`,
  );
  return [...seen];
}

function isBlocked(word: string): boolean {
  if (BLOCKED_WORDS.has(word) || BLOCKED_GRIM.has(word)) return true;
  if (BLOCKED_PARTS.some((part) => word.includes(part))) return true;
  // A blocked word on either side of an underscore is still that word.
  return word
    .split("_")
    .some((part) => BLOCKED_WORDS.has(part) || BLOCKED_GRIM.has(part));
}

/** Fisher–Yates on the CSPRNG: which 8,000 of 80,000 is not a secret, but the
 *  draw is cheap and `Math.random`'s state is recoverable from its output. */
function shuffle(list: string[]): void {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
}

/**
 * The pool as a module: whitespace-separated names in one template literal,
 * split at load. 8,000 quoted array entries would be 8,000 lines of noise in
 * a file nobody reads line by line; this is the same list in an eighth of the
 * bytes, and the split costs a fraction of a millisecond once per process.
 */
function render(list: readonly string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < list.length; i += 8) {
    lines.push(list.slice(i, i + 8).join(" "));
  }

  return `/**
 * The bot name pool — ${list.length} usernames, generated.
 *
 * **Do not edit by hand.** Rebuilt by scripts/make-bot-names.ts from a
 * wordlist; half the names are words as found, half carry the digits, initials
 * and tags people put on a handle. lib/game/bot-names.ts is what reads it, and
 * the reasoning about why a bot has a name at all lives there.
 *
 * Every entry is a valid stored username (\`[a-z0-9_]\`, 3–20), checked at
 * generation and again by npm run versus:bot:check.
 */

/* eslint-disable */
export const BOT_NAME_POOL: readonly string[] = Object.freeze(
  \`${lines.join("\n")}\`
    .split(/\\s+/)
    .filter(Boolean),
);
`;
}

function report(names: readonly string[], styleUse: ReadonlyMap<string, number>): void {
  const decorated = names.filter((name) => /[0-9_]/.test(name)).length;
  const lengths = names.map((name) => name.length);
  console.log(`pool: ${names.length} names, ${decorated} carrying a digit or underscore`);
  console.log(`lengths: ${Math.min(...lengths)}–${Math.max(...lengths)}`);
  const used = [...styleUse].sort((a, b) => b[1] - a[1]);
  console.log(`styles: ${used.map(([name, count]) => `${name} ${count}`).join(", ")}`);
  console.log(`samples: ${sample(names, 12).join(", ")}`);
}

function sample(names: readonly string[], count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) out.push(names[randomInt(0, names.length)]!);
  return out;
}

function valueOf(flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function fail(why: string): never {
  console.error(`make-bot-names: ${why}`);
  process.exit(1);
}

main();
