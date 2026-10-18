/**
 * Plays the online head-to-head's stand-in opponent against a spread of real
 * dataset years and asserts it never does anything a person could not.
 *
 *   npm run versus:bot:check
 *
 * Pure simulation — no database, no network — with a seeded PRNG, so a run is
 * reproducible and a failure can be replayed. For every profile (6 characters
 * x 3 levels) and every probe year it plans `DRAWS` answers and checks each
 * one: on the slider's grid, inside the rails, inside the recent anchor for
 * modern events, graded and scored by the one grader, and thought about for a
 * time inside the profile's window and the round. Where one side of an event
 * has only a sliver of room — the present for a 2010s event, the modern era
 * for a pre-modern one — it checks that side gets only the share of answers
 * the tier's gap law puts there, and it checks a bottom-league bot's shown
 * rating sits on the 5-KP grid real ratings there move on. It then reports
 * how often each tier came up against what the character matrix says it
 * should, how often step 4 rounded, and a handful of real guesses per
 * character.
 *
 * Exits 1 on any violation, including an observed tier share more than
 * `FREQUENCY_TOLERANCE` away from its target on the years where every tier is
 * reachable.
 */

import {
  BOT_NAMES,
  botShownRating,
  pickBotNames,
} from "../lib/game/bot-names.ts";
import { chronoTier } from "../lib/game/chrono-rating.ts";
import {
  gradeGuess,
  roundPoints,
  VERDICTS,
  verdictDistanceRange,
  type Verdict,
} from "../lib/game/scoring.ts";
import { paneBounds, paneForYear, TIMELINE_PANES } from "../lib/game/timeline.ts";
import {
  BOT_ARCHETYPES,
  botProfile,
  isBotArchetype,
  isOnRail,
  pickBotArchetype,
  planBotMatch,
  snapToRail,
  tierWeightsFor,
  traceBotMove,
  type BotLevel,
  type BotMoveTrace,
  type BotProfile,
  type Rng,
} from "../lib/game/versus-bot.ts";
import { ROUND_SECONDS } from "../lib/game/versus.ts";

const SEED = 0x7e3905;
const DRAWS = 1500;
const FREQUENCY_TOLERANCE = 0.02;
const LEVELS: readonly BotLevel[] = [1, 2, 3];

/**
 * The little-room bounds. Each sits well clear of both what the gap law gives
 * (good answers on 2024+ for a 2010s event at most ~15%, all answers ~5%, a
 * pre-modern wayOff turning modern ~9%) and what an even split of the sides
 * gave (50%, ~19%, 50%).
 */
const ROOM_DRAWS = 3_000;
const PRESENT_PILE_FROM = 2024;
const PRESENT_GOOD_LIMIT = 0.2;
const PRESENT_ALL_LIMIT = 0.1;
const MODERN_FROM = 1950;
const MODERN_WAY_OFF_LIMIT = 0.12;

/**
 * The bottom league's rating step, and how often a bot there may show a
 * relegated player's off-grid rating: about a quarter of the time opposite a
 * host at the top of the league, where relegated players gather; a third
 * would no longer be "the large majority on the grid".
 */
const BOTTOM_STEP = 5;
const OFF_GRID_LIMIT = 1 / 3;
const shownOffGrid = new Map<string, number>();

/** Real years from the dataset's range: deep time, the BCE hinge, CE, the present. */
const YEARS = [
  -4_539_999_999, -64_999_999, -2_599_999, -299_999, -9_999, -2_999, -499, -3,
  0, 476, 1066, 1492, 1789, 1850, 1914, 1969, 2001, 2020,
];

const RAIL_MIN = paneBounds(TIMELINE_PANES[0]!).min;
const RAIL_MAX = paneBounds(TIMELINE_PANES[TIMELINE_PANES.length - 1]!).max;

/** mulberry32: tiny, fast, good enough to draw a few hundred thousand guesses. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const violations: string[] = [];
function fail(message: string): void {
  violations.push(message);
}

function fmtYear(year: number): string {
  if (year <= 0) return `${(1 - year).toLocaleString("en-US")} BCE`;
  return String(year);
}

function pct(share: number): string {
  return (share * 100).toFixed(1).padStart(5);
}

function label(profile: BotProfile): string {
  return `${profile.archetype} L${profile.level}`;
}

/* ---------------------------------------------------------------------------
   The helpers the planner stands on
   --------------------------------------------------------------------------- */

const rng = mulberry32(SEED);

// verdictDistanceRange is gradeGuess run backwards: both edges of every band
// grade as that band, and one year past either edge does not.
{
  const probes = [...YEARS, 2026, 1, -1, -10_000, -9_999_999, -9_999_999_999];
  for (let i = 0; i < 400; i += 1) {
    probes.push(Math.round(RAIL_MIN + (RAIL_MAX - RAIL_MIN) * rng() ** 6));
  }
  for (const actual of probes) {
    for (const verdict of VERDICTS) {
      const range = verdictDistanceRange(verdict, actual);
      if (range === null) {
        fail(`verdictDistanceRange(${verdict}, ${actual}) is empty`);
        continue;
      }
      const at = (d: number) => gradeGuess(actual - d, actual).verdict;
      if (at(range.min) !== verdict) fail(`range ${verdict}@${actual}: min ${range.min} grades ${at(range.min)}`);
      if (range.min > 0 && at(range.min - 1) === verdict) fail(`range ${verdict}@${actual}: min-1 still ${verdict}`);
      if (Number.isFinite(range.max)) {
        if (at(range.max) !== verdict) fail(`range ${verdict}@${actual}: max ${range.max} grades ${at(range.max)}`);
        if (at(range.max + 1) === verdict) fail(`range ${verdict}@${actual}: max+1 still ${verdict}`);
      } else if (verdict !== "wayOff") {
        fail(`range ${verdict}@${actual}: unbounded`);
      }
    }
  }
}

// snapToRail is the drag's own grid: idempotent, always on the rail, and the
// grid steps are the panes' (1 / 1 / 10 / 100 years).
{
  const fixed: [number, boolean][] = [
    [2026, true], [2027, false], [0, true], [-9_999, true], [-10_000, false],
    [-10_009, true], [-1_234_567, false], [-1_234_569, true], [-9_999_999, true],
    [-10_000_049, false], [-10_000_099, true], [-9_999_999_999, true],
    [-10_000_000_000, false], [1969.5, false],
  ];
  for (const [year, expected] of fixed) {
    if (isOnRail(year) !== expected) fail(`isOnRail(${year}) should be ${expected}`);
  }
  for (let i = 0; i < 20_000; i += 1) {
    const y = RAIL_MIN + (RAIL_MAX - RAIL_MIN) * rng() ** 8 + (rng() - 0.5) * 3000;
    const snapped = snapToRail(y);
    if (!isOnRail(snapped)) fail(`snapToRail(${y}) = ${snapped} is off the rail`);
    if (snapToRail(snapped) !== snapped) fail(`snapToRail is not idempotent at ${snapped}`);
  }
}

// The matrix as transcribed: every profile is frozen, sums to 1, and the
// modernist rule keeps it summing to 1.
for (const archetype of BOT_ARCHETYPES) {
  if (!isBotArchetype(archetype)) fail(`isBotArchetype(${archetype}) is false`);
  for (const level of LEVELS) {
    const profile = botProfile(archetype, level);
    const sum = VERDICTS.reduce((s, v) => s + profile.weights[v], 0);
    if (Math.abs(sum - 1) > 1e-9) fail(`${label(profile)} weights sum to ${sum}`);
    const [low, high] = profile.thinkSeconds;
    if (!(low > 0 && low < high && high * 1000 < ROUND_SECONDS * 1000)) {
      fail(`${label(profile)} think window ${low}-${high}s`);
    }
    for (const year of YEARS) {
      const w = tierWeightsFor(profile, year);
      const s = VERDICTS.reduce((acc, v) => acc + w[v], 0);
      if (Math.abs(s - 1) > 1e-9) fail(`${label(profile)}@${year} tier weights sum to ${s}`);
      if (Math.abs(w.perfect - profile.weights.perfect) > 1e-12) fail(`${label(profile)}@${year} moved perfect`);
    }
  }
}
if (isBotArchetype("robot")) fail(`isBotArchetype accepts "robot"`);

/* ---------------------------------------------------------------------------
   Feasibility: which tiers each probe year can hold at all
   --------------------------------------------------------------------------- */

function onlyTier(verdict: Verdict): BotProfile {
  const weights = Object.fromEntries(VERDICTS.map((v) => [v, v === verdict ? 1 : 0])) as Record<Verdict, number>;
  return { archetype: "rookie", level: 1, weights, thinkSeconds: [2, 5] };
}

const fullYears = new Set<number>();
console.log("feasibility (every tier placeable without fallback):");
for (const year of YEARS) {
  const missing = VERDICTS.filter((verdict) => {
    const profile = onlyTier(verdict);
    for (let i = 0; i < 200; i += 1) {
      if (traceBotMove(year, profile, rng).fellBack) return true;
    }
    return false;
  });
  if (missing.length === 0) fullYears.add(year);
  console.log(`  ${fmtYear(year).padStart(18)}  ${missing.length === 0 ? "all five" : `missing ${missing.join(", ")}`}`);
}

/* ---------------------------------------------------------------------------
   The simulation
   --------------------------------------------------------------------------- */

interface Tally {
  observed: Record<Verdict, number>;
  target: Record<Verdict, number>;
  n: number;
  nonPerfect: number;
  rounded: number;
  changed: number;
  fellBack: number;
}

function emptyTally(): Tally {
  const zero = () => Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  return { observed: zero(), target: zero(), n: 0, nonPerfect: 0, rounded: 0, changed: 0, fellBack: 0 };
}

const tallies = new Map<string, Tally>();
const recentWorst = new Map<number, number>();
const deepWayOff: number[] = [];
const moonWayOff: number[] = [];
type Sample = BotMoveTrace & { actual: number };
const roundedDeep: Sample[] = [];
const roundedCe: Sample[] = [];
/** Deep guesses rounded onto a power of ten — "10,000,000 BCE", not 10,000,090. */
const roundedToPower: Sample[] = [];

let totalMoves = 0;

for (const archetype of BOT_ARCHETYPES) {
  for (const level of LEVELS) {
    const profile = botProfile(archetype, level);
    const tally = emptyTally();
    tallies.set(label(profile), tally);
    const [low, high] = profile.thinkSeconds;

    for (const year of YEARS) {
      const weights = tierWeightsFor(profile, year);
      for (let i = 0; i < DRAWS; i += 1) {
        const trace = traceBotMove(year, profile, rng);
        const { guess, verdict, points, thinkMs } = trace.move;
        const where = `${label(profile)} @ ${fmtYear(year)}: guess ${guess}`;
        totalMoves += 1;

        if (!Number.isInteger(guess) || !isOnRail(guess)) fail(`${where} is off the rail`);
        if (guess < RAIL_MIN || guess > RAIL_MAX) fail(`${where} is outside the rails`);
        if (!isOnRail(trace.unrounded)) fail(`${where}: unrounded ${trace.unrounded} off the rail`);
        if (year >= 1850 && (guess < 1600 || guess > RAIL_MAX)) fail(`${where} breaks the recent anchor`);

        const accuracy = gradeGuess(guess, year);
        if (accuracy.verdict !== verdict) fail(`${where}: verdict ${verdict} but grades ${accuracy.verdict}`);
        if (roundPoints(accuracy) !== points) fail(`${where}: points ${points} but scores ${roundPoints(accuracy)}`);
        if (verdict === "perfect" && guess !== year) fail(`${where}: perfect on another year`);
        if (trace.drawn === "perfect" && trace.rounding !== "none") fail(`${where}: rounded a perfect`);
        if (trace.rounding === "rounded" && gradeGuess(trace.unrounded, year).verdict !== verdict) {
          fail(`${where}: rounding changed the tier`);
        }

        if (!Number.isInteger(thinkMs) || thinkMs < low * 1000 || thinkMs >= high * 1000) {
          fail(`${where}: think ${thinkMs}ms outside ${low}-${high}s`);
        }
        if (thinkMs >= ROUND_SECONDS * 1000) fail(`${where}: think ${thinkMs}ms outlasts the round`);

        if (trace.fellBack) tally.fellBack += 1;
        if (verdict !== "perfect") {
          tally.nonPerfect += 1;
          if (trace.rounding === "rounded") tally.rounded += 1;
          if (trace.rounding === "rounded" && guess !== trace.unrounded) tally.changed += 1;
        }
        if (fullYears.has(year)) {
          tally.n += 1;
          tally.observed[verdict] += 1;
          for (const v of VERDICTS) tally.target[v] += weights[v];
        }

        if (year >= 1850) recentWorst.set(year, Math.min(recentWorst.get(year) ?? Infinity, guess));
        if (year === -64_999_999 && verdict === "wayOff") deepWayOff.push(guess);
        if (year === 1969 && verdict === "wayOff") moonWayOff.push(guess);
        if (trace.rounding === "rounded" && guess !== trace.unrounded) {
          const sample = { ...trace, actual: year };
          const pane = paneForYear(guess);
          const display = 1 - guess;
          if ((pane === "evolution" || pane === "cosmos") && roundedDeep.length < 400) roundedDeep.push(sample);
          if (pane !== "ce" && display >= 10_000 && Number.isInteger(Math.log10(display))) {
            roundedToPower.push(sample);
          }
          if (pane === "ce" && roundedCe.length < 400) roundedCe.push(sample);
        }
      }
    }
  }
}

// planBotMatch is planBotMove in order, and a seed replays a match exactly.
{
  const years = YEARS.slice(0, 10);
  const a = planBotMatch(years, botProfile("historian", 2), mulberry32(42));
  const b = planBotMatch(years, botProfile("historian", 2), mulberry32(42));
  if (a.length !== years.length) fail(`planBotMatch returned ${a.length} moves for ${years.length} years`);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail("planBotMatch is not reproducible from a seed");
}

// Archetypes are drawn evenly.
{
  const counts = new Map<string, number>();
  const n = 60_000;
  for (let i = 0; i < n; i += 1) {
    const a = pickBotArchetype(rng);
    counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  for (const archetype of BOT_ARCHETYPES) {
    const share = (counts.get(archetype) ?? 0) / n;
    if (Math.abs(share - 1 / BOT_ARCHETYPES.length) > 0.01) fail(`pickBotArchetype: ${archetype} at ${pct(share)}%`);
  }
}

/* ---------------------------------------------------------------------------
   Names and shown ratings
   --------------------------------------------------------------------------- */

{
  // The generated pool is 8,000 of these; a run that found only the hand-
  // written few hundred means bot-name-pool.ts was lost or truncated, which
  // nothing else would notice until players started meeting the same opponent
  // twice.
  if (BOT_NAMES.length < 8_000) fail(`only ${BOT_NAMES.length} bot names`);
  if (new Set(BOT_NAMES).size !== BOT_NAMES.length) {
    const seen = new Set<string>();
    for (const name of BOT_NAMES) {
      if (seen.has(name)) fail(`duplicate bot name ${name}`);
      seen.add(name);
    }
  }
  for (const name of BOT_NAMES) {
    if (!/^[a-z0-9_]{3,20}$/.test(name)) fail(`bot name "${name}" is not a valid username`);
  }
  const pool = new Set(BOT_NAMES);
  for (let i = 0; i < 2_000; i += 1) {
    const picked = pickBotNames(rng, 8);
    if (picked.length !== 8 || new Set(picked).size !== 8) fail(`pickBotNames gave ${picked.join(",")}`);
    if (picked.some((name) => !pool.has(name))) fail("pickBotNames invented a name");
  }
  if (pickBotNames(rng, BOT_NAMES.length + 5).length !== BOT_NAMES.length) fail("pickBotNames overran the pool");

  const hosts: Record<BotLevel, (number | null)[]> = {
    1: [null, 0, 4, 120, 280, 299],
    2: [300, 310, 500, 690, 699],
    3: [700, 705, 950, 1800],
  };
  for (const level of LEVELS) {
    for (const host of hosts[level]) {
      let offGrid = 0;
      for (let i = 0; i < 2_000; i += 1) {
        const shown = botShownRating(rng, level, host);
        if (!Number.isInteger(shown) || shown < 0 || chronoTier(shown) !== level) {
          fail(`botShownRating(L${level}, host ${host}) = ${shown}`);
        }
        // The bottom league moves in fives (+30 / -10 / +5, floored at 0), so
        // a rating there is off that grid only for a player relegated from the
        // middle league, who lands on 282-299: never low, never a newcomer.
        if (level === 1 && shown % BOTTOM_STEP !== 0) {
          offGrid += 1;
          if (shown < 200 || host === null) {
            fail(`botShownRating(L1, host ${host}) = ${shown}: off the ${BOTTOM_STEP}-KP grid`);
          }
        }
      }
      if (level === 1) {
        shownOffGrid.set(`host ${host}`, offGrid / 2_000);
        if (offGrid / 2_000 > OFF_GRID_LIMIT) {
          fail(`botShownRating(L1, host ${host}): ${pct(offGrid / 2_000)}% off the ${BOTTOM_STEP}-KP grid`);
        }
      }
    }
  }
}

/* ---------------------------------------------------------------------------
   Little room on one side
   --------------------------------------------------------------------------- */

// Where one side of an event holds only a sliver of the tier's band — the few
// years left before the present for a 2010s event's good answers; the last
// 15% of a pre-modern event's age for its wayOff ones — that side must get
// the share the tier's gap law puts there, not half. Half stacks the answers
// on the few years left: 2025 and 2026 for a 2016 event, 1991-2026 for 1789.
const presentPile = new Map<number, { good: number; all: number }>();
const modernWayOff = new Map<number, number>();
{
  const goodOnly = onlyTier("good");
  for (let year = 2006; year <= 2017; year += 1) {
    let good = 0;
    for (let i = 0; i < ROOM_DRAWS; i += 1) {
      if (traceBotMove(year, goodOnly, rng).move.guess >= PRESENT_PILE_FROM) good += 1;
    }
    let all = 0;
    let n = 0;
    for (const archetype of BOT_ARCHETYPES) {
      for (const level of LEVELS) {
        const profile = botProfile(archetype, level);
        for (let i = 0; i < ROOM_DRAWS / 10; i += 1) {
          n += 1;
          if (traceBotMove(year, profile, rng).move.guess >= PRESENT_PILE_FROM) all += 1;
        }
      }
    }
    presentPile.set(year, { good: good / ROOM_DRAWS, all: all / n });
    if (good / ROOM_DRAWS > PRESENT_GOOD_LIMIT) {
      fail(`${fmtYear(year)}: ${pct(good / ROOM_DRAWS)}% of good answers on ${PRESENT_PILE_FROM} or later`);
    }
    if (all / n > PRESENT_ALL_LIMIT) {
      fail(`${fmtYear(year)}: ${pct(all / n)}% of all answers on ${PRESENT_PILE_FROM} or later`);
    }
  }

  const wayOffOnly = onlyTier("wayOff");
  for (const year of [-499, -3, 0, 476, 1066, 1492, 1600, 1700, 1789, 1840, 1849]) {
    let modern = 0;
    for (let i = 0; i < ROOM_DRAWS; i += 1) {
      if (traceBotMove(year, wayOffOnly, rng).move.guess >= MODERN_FROM) modern += 1;
    }
    modernWayOff.set(year, modern / ROOM_DRAWS);
    if (modern / ROOM_DRAWS > MODERN_WAY_OFF_LIMIT) {
      fail(`${fmtYear(year)}: ${pct(modern / ROOM_DRAWS)}% of wayOff answers on ${MODERN_FROM} or later`);
    }
  }
}

/* ---------------------------------------------------------------------------
   Report
   --------------------------------------------------------------------------- */

console.log(`\n${totalMoves.toLocaleString("en-US")} moves (${DRAWS} per profile per year, seed ${SEED}).`);
console.log(
  `\nobserved / target tier share, % — over the ${fullYears.size} years where every tier is placeable:`,
);
console.log(
  `  ${"profile".padEnd(13)}${VERDICTS.map((v) => v.padStart(14)).join("")}   rounded  changed  fellback`,
);
for (const [name, tally] of tallies) {
  const cells = VERDICTS.map((verdict) => {
    const observed = tally.observed[verdict] / tally.n;
    const target = tally.target[verdict] / tally.n;
    if (Math.abs(observed - target) > FREQUENCY_TOLERANCE) {
      fail(`${name}: ${verdict} observed ${pct(observed)}% vs target ${pct(target)}%`);
    }
    return `${pct(observed)}/${pct(target)}`.padStart(14);
  }).join("");
  const rounded = pct(tally.rounded / tally.nonPerfect);
  const changed = pct(tally.changed / tally.nonPerfect);
  console.log(`  ${name.padEnd(13)}${cells}   ${rounded}%   ${changed}%   ${tally.fellBack}`);
}

console.log("\nrecent anchor — the oldest guess seen for each modern event (must be >= 1600):");
for (const [year, worst] of recentWorst) {
  console.log(`  ${String(year).padStart(6)}: ${fmtYear(worst)}`);
}
{
  const byCentury = new Map<number, number>();
  for (const guess of moonWayOff) {
    const century = Math.floor(guess / 100) * 100;
    byCentury.set(century, (byCentury.get(century) ?? 0) + 1);
  }
  const spread = [...byCentury]
    .sort((a, b) => a[0] - b[0])
    .map(([century, n]) => `${century}s ${pct(n / moonWayOff.length).trim()}%`)
    .join(" · ");
  console.log(`  1969's ${moonWayOff.length} wayOff guesses by century: ${spread}`);
}

{
  const sorted = [...deepWayOff].sort((a, b) => b - a);
  const young = sorted.filter((g) => g > -100_000).length;
  const crossPane = sorted.filter((g) => g > -9_999_999).length;
  const old = sorted.filter((g) => g < -64_999_999).length;
  console.log(
    `\nBCE scale blindness — 65 million BCE, ${deepWayOff.length} wayOff guesses: ${old} older, ` +
      `${crossPane} on a younger pane, ${young} younger than 100,000 BCE.`,
  );
  console.log(`  youngest few: ${sorted.slice(0, 6).map(fmtYear).join(" · ")}`);
  const near10k = [...sorted]
    .sort((a, b) => Math.abs(1 - a - 10_000) - Math.abs(1 - b - 10_000))
    .slice(0, 8)
    .sort((a, b) => b - a);
  console.log(`  near 10,000 BCE: ${near10k.map(fmtYear).join(" · ")}`);
  console.log(`  oldest few: ${sorted.slice(-3).map(fmtYear).join(" · ")}`);
}

console.log(`\nlittle room on one side — answers on ${PRESENT_PILE_FROM} or later (good only / every profile):`);
console.log(
  `  ${[...presentPile].map(([year, share]) => `${year} ${pct(share.good).trim()}/${pct(share.all).trim()}%`).join(" · ")}`,
);
console.log(`  wayOff answers on ${MODERN_FROM} or later, events before the anchor:`);
console.log(`  ${[...modernWayOff].map(([year, share]) => `${fmtYear(year)} ${pct(share).trim()}%`).join(" · ")}`);

console.log("\nshown ratings off the bottom league's 5-KP grid:");
console.log(
  `  ${[...shownOffGrid].map(([host, share]) => `${host} ${pct(share).trim()}%`).join(" · ")}`,
);

{
  console.log("\nhuman rounding — snapped guess -> rounded guess:");
  const pickSome = (traces: Sample[], n: number) =>
    traces.filter((_, i) => i % Math.max(1, Math.floor(traces.length / n)) === 0).slice(0, n);
  const show = (trace: Sample) =>
    console.log(
      `  ${fmtYear(trace.unrounded).padStart(22)} -> ${fmtYear(trace.move.guess).padEnd(22)}` +
        `(${trace.move.verdict} for ${fmtYear(trace.actual)})`,
    );
  // The closest calls first: a snapped guess a hair off a round number, which
  // is exactly the precision a person would never give.
  [...roundedToPower]
    .sort((a, b) => Math.abs(a.unrounded - a.move.guess) / (1 - a.move.guess) - Math.abs(b.unrounded - b.move.guess) / (1 - b.move.guess))
    .slice(0, 4)
    .forEach(show);
  pickSome(roundedDeep, 5).forEach(show);
  pickSome(roundedCe, 4).forEach(show);
}

console.log("\nsample matches, level 2 (event -> guess, tier, points, think):");
{
  const sampleYears = [-64_999_999, -2_999, 476, 1492, 1914, 1969];
  const sampleRng = mulberry32(SEED + 1);
  for (const archetype of BOT_ARCHETYPES) {
    const moves = planBotMatch(sampleYears, botProfile(archetype, 2), sampleRng);
    console.log(`  ${archetype}`);
    moves.forEach((move, i) => {
      console.log(
        `    ${fmtYear(sampleYears[i]!).padStart(16)} -> ${fmtYear(move.guess).padEnd(18)}` +
          `${move.verdict.padEnd(8)}${String(move.points).padStart(4)}  ${(move.thinkMs / 1000).toFixed(1)}s`,
      );
    });
  }
}

if (violations.length > 0) {
  console.error(`\n${violations.length} violation(s):`);
  for (const message of violations.slice(0, 40)) console.error(`  ${message}`);
  if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
  process.exit(1);
}
console.log("\nok — no violations.");
