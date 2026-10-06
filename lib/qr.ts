/**
 * A QR encoder, in about as little as the format allows.
 *
 * **Why this is here rather than in package.json.** The invite screen needs a
 * QR code and there are only three ways to get one: a hosted image service, a
 * dependency, or the algorithm. The hosted service is out on its own — it
 * would put the invite URL, which is a capability to join someone's game, into
 * a third party's logs, and it would make the lobby fail whenever that service
 * did. Between the other two: this is a frozen, fully specified format with no
 * upstream to track, the whole of what the site needs is one mode and one
 * error-correction level, and the result is a few hundred lines that never
 * need updating. A dependency would be more code, not less, and one more thing
 * in the supply chain of a site that currently has seven.
 *
 * **What it covers, and what it does not.** Byte mode, error correction level
 * M (~15% recoverable), versions 1 to 10 — up to 216 bytes, where the invite
 * URLs this exists for are around forty. Anything longer throws rather than
 * silently producing a code that will not scan. Numeric and alphanumeric modes
 * would pack a URL tighter; they are not implemented because at this length
 * the version would come out the same.
 *
 * Everything below is the specification (ISO/IEC 18004) rather than anything
 * invented here, so the comments mark out *which* part of it each step is
 * rather than explaining the reasoning — there isn't any.
 */

/** Error correction level M, the only one used here. */
const EC_LEVEL_BITS = 0b00;

/**
 * Per version (index 0 is version 1): total codewords, EC codewords per
 * block, and the block layout as [count, dataCodewords] groups.
 *
 * Straight out of the standard's tables for level M. The two-group versions
 * are the ones where the blocks cannot be equal sized; the second group's
 * blocks always hold exactly one more codeword than the first's.
 */
interface VersionSpec {
  totalCodewords: number;
  ecPerBlock: number;
  groups: [count: number, dataCodewords: number][];
}

const VERSIONS: VersionSpec[] = [
  { totalCodewords: 26, ecPerBlock: 10, groups: [[1, 16]] },
  { totalCodewords: 44, ecPerBlock: 16, groups: [[1, 28]] },
  { totalCodewords: 70, ecPerBlock: 26, groups: [[1, 44]] },
  { totalCodewords: 100, ecPerBlock: 18, groups: [[2, 32]] },
  { totalCodewords: 134, ecPerBlock: 24, groups: [[2, 43]] },
  { totalCodewords: 172, ecPerBlock: 16, groups: [[4, 27]] },
  { totalCodewords: 196, ecPerBlock: 18, groups: [[4, 31]] },
  { totalCodewords: 242, ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { totalCodewords: 292, ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { totalCodewords: 346, ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
];

/** Alignment pattern centre coordinates per version. Version 1 has none. */
const ALIGNMENT_CENTERS: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Pre-computed 18-bit version information, versions 7 to 10. */
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

/* -------------------------------------------------------------------------
   GF(256), for Reed-Solomon
   ------------------------------------------------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    // 0x11D is the field's primitive polynomial.
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]!;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/** Generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);

  // Repeatedly multiply by (x - a^i). Coefficients run highest degree first,
  // so the `x` term moves a coefficient one place toward index 0 and the
  // constant term leaves it where it is — getting those two the wrong way
  // round builds the polynomial backwards, which still produces plausible
  // codewords and a code that will not scan.
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ poly[j]!;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }

  return poly;
}

/** Polynomial remainder of `data` divided by the generator — the EC block. */
function ecCodewords(data: Uint8Array, count: number): Uint8Array {
  const generator = generatorPoly(count);
  const remainder = new Uint8Array(count);

  for (const byte of data) {
    const factor = byte ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[count - 1] = 0;
    for (let i = 0; i < count; i += 1) {
      remainder[i] = remainder[i]! ^ gfMul(generator[i + 1]!, factor);
    }
  }

  return remainder;
}

/* -------------------------------------------------------------------------
   Encoding
   ------------------------------------------------------------------------- */

/** The smallest version that fits `byteLength` bytes in byte mode at level M. */
function pickVersion(byteLength: number): number {
  for (let version = 1; version <= VERSIONS.length; version += 1) {
    const spec = VERSIONS[version - 1]!;
    const dataCodewords = spec.groups.reduce(
      (total, [count, size]) => total + count * size,
      0,
    );
    // 4 bits of mode indicator plus the character count field.
    const headerBits = 4 + (version < 10 ? 8 : 16);
    if (headerBits + byteLength * 8 <= dataCodewords * 8) return version;
  }

  throw new Error(
    `QR payload of ${byteLength} bytes exceeds version 10 at EC level M.`,
  );
}

class BitWriter {
  private bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  toCodewords(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < this.bits.length; i += 1) {
      if (this.bits[i] === 1) out[i >>> 3]! |= 0x80 >>> (i & 7);
    }
    return out;
  }
}

/** Data codewords for one payload: header, bytes, terminator, padding. */
function dataCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version - 1]!;
  const capacity = spec.groups.reduce(
    (total, [count, size]) => total + count * size,
    0,
  );

  const writer = new BitWriter();
  writer.push(0b0100, 4); // byte mode
  writer.push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) writer.push(byte, 8);

  // Terminator, then pad to a codeword boundary.
  const remaining = capacity * 8 - writer.length;
  writer.push(0, Math.min(4, remaining));
  if (writer.length % 8 !== 0) writer.push(0, 8 - (writer.length % 8));

  const codewords = writer.toCodewords(capacity);

  // The specified alternating pad bytes.
  let at = writer.length / 8;
  for (let i = 0; at < capacity; i += 1, at += 1) {
    codewords[at] = i % 2 === 0 ? 0xec : 0x11;
  }

  return codewords;
}

/**
 * Split into blocks, compute each block's EC, then interleave both — which is
 * what spreads a physical smudge across every block instead of destroying one.
 */
function interleave(data: Uint8Array, version: number): Uint8Array {
  const spec = VERSIONS[version - 1]!;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;

  for (const [count, size] of spec.groups) {
    for (let i = 0; i < count; i += 1) {
      const block = data.subarray(offset, offset + size);
      offset += size;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, spec.ecPerBlock));
    }
  }

  const out: number[] = [];
  const longest = Math.max(...dataBlocks.map((block) => block.length));

  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out.push(block[i]!);
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) out.push(block[i]!);
  }

  return Uint8Array.from(out);
}

/* -------------------------------------------------------------------------
   The matrix
   ------------------------------------------------------------------------- */

/** `null` marks a module that is still free for data. */
type Grid = (boolean | null)[][];

function placeFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.length;

  const finder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = row + r;
        const x = col + c;
        if (y < 0 || y >= size || x < 0 || x >= size) continue;
        const inRing =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6));
        const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[y]![x] = inRing || inCore;
      }
    }
  };

  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    grid[6]![i] = i % 2 === 0;
    grid[i]![6] = i % 2 === 0;
  }

  // Alignment patterns, skipping the three that would sit on a finder.
  const centers = ALIGNMENT_CENTERS[version - 1]!;
  for (const row of centers) {
    for (const col of centers) {
      const onFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === size - 7) ||
        (row === size - 7 && col === 6);
      if (onFinder) continue;

      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          grid[row + r]![col + c] =
            Math.max(Math.abs(r), Math.abs(c)) !== 1;
        }
      }
    }
  }

  // The permanently dark module.
  grid[size - 8]![8] = true;

  // Reserve the format areas so data placement skips them.
  for (let i = 0; i < 9; i += 1) {
    if (grid[8]![i] === null) grid[8]![i] = false;
    if (grid[i]![8] === null) grid[i]![8] = false;
  }
  for (let i = 0; i < 8; i += 1) {
    if (grid[8]![size - 1 - i] === null) grid[8]![size - 1 - i] = false;
    if (grid[size - 1 - i]![8] === null) grid[size - 1 - i]![8] = false;
  }

  // Version information, versions 7 and up.
  if (version >= 7) {
    const info = VERSION_INFO[version]!;
    for (let i = 0; i < 18; i += 1) {
      const bit = ((info >> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = size - 11 + (i % 3);
      grid[row]![col] = bit;
      grid[col]![row] = bit;
    }
  }
}

/** The zig-zag data placement: two columns at a time, right to left. */
function placeData(grid: Grid, codewords: Uint8Array): void {
  const size = grid.length;
  let bit = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is not part of the walk.
    if (right === 6) right = 5;

    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        if (grid[row]![col] !== null) continue;
        const byte = codewords[bit >>> 3] ?? 0;
        grid[row]![col] = ((byte >> (7 - (bit & 7))) & 1) === 1;
        bit += 1;
      }
    }

    upward = !upward;
  }
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** 15-bit BCH format information for level M and the given mask. */
function formatBits(mask: number): number {
  const data = (EC_LEVEL_BITS << 3) | mask;
  let value = data << 10;

  for (let i = 4; i >= 0; i -= 1) {
    if ((value >> (10 + i)) & 1) value ^= 0b10100110111 << i;
  }

  return ((data << 10) | value) ^ 0b101010000010010;
}

function placeFormat(grid: Grid, mask: number): void {
  const size = grid.length;
  const bits = formatBits(mask);

  for (let i = 0; i < 15; i += 1) {
    const on = ((bits >> i) & 1) === 1;

    // Copy one: down the left of the top-left finder, then along its
    // underside. The two halves are transposed relative to each other, which
    // is the easy thing to get backwards here.
    if (i < 6) grid[i]![8] = on;
    else if (i === 6) grid[7]![8] = on;
    else if (i === 7) grid[8]![8] = on;
    else if (i === 8) grid[8]![7] = on;
    else grid[8]![14 - i] = on;

    // Copy two: split between the other two finders.
    if (i < 8) grid[8]![size - 1 - i] = on;
    else grid[size - 15 + i]![8] = on;
  }
}

/** The four penalty rules, which decide which mask is used. */
function penalty(grid: Grid): number {
  const size = grid.length;
  const at = (r: number, c: number) => grid[r]![c] === true;
  let score = 0;

  // Rule 1: runs of five or more in a line.
  for (let i = 0; i < size; i += 1) {
    for (const horizontal of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        const previous = horizontal ? at(i, j - 1) : at(j - 1, i);
        const current = horizontal ? at(i, j) : at(j, i);
        if (current === previous) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const first = at(r, c);
      if (
        first === at(r, c + 1) &&
        first === at(r + 1, c) &&
        first === at(r + 1, c + 1)
      ) {
        score += 3;
      }
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
  const patternA = [true, false, true, true, true, false, true, false, false, false, false];
  const patternB = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c + 11 <= size; c += 1) {
      let matchA = true;
      let matchB = true;
      for (let k = 0; k < 11; k += 1) {
        const horizontal = at(r, c + k);
        if (horizontal !== patternA[k]) matchA = false;
        if (horizontal !== patternB[k]) matchB = false;
      }
      if (matchA || matchB) score += 40;

      let matchC = true;
      let matchD = true;
      for (let k = 0; k < 11; k += 1) {
        const vertical = at(c + k, r);
        if (vertical !== patternA[k]) matchC = false;
        if (vertical !== patternB[k]) matchD = false;
      }
      if (matchC || matchD) score += 40;
    }
  }

  // Rule 4: deviation from an even split of dark and light.
  let dark = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) if (at(r, c)) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

/* -------------------------------------------------------------------------
   Public surface
   ------------------------------------------------------------------------- */

export interface QrMatrix {
  /** Modules per side, excluding the quiet zone. */
  size: number;
  /** Row-major; `true` is a dark module. */
  modules: boolean[][];
}

/**
 * Encode `text` as a QR matrix.
 *
 * All eight masks are applied and scored, and the lowest-penalty one wins —
 * which is what the standard asks for and is the difference between a code
 * that scans at an angle and one that does not.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;

  const codewords = interleave(dataCodewords(bytes, version), version);

  const base: Grid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null as boolean | null),
  );
  placeFunctionPatterns(base, version);

  // Which modules are function patterns — masking must leave them alone, so
  // this is captured before the data goes in.
  const reserved = base.map((row) => row.map((cell) => cell !== null));
  placeData(base, codewords);

  let best: Grid | null = null;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((row) => [...row]);
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (reserved[r]![c]) continue;
        if (MASKS[mask]!(r, c)) candidate[r]![c] = !candidate[r]![c];
      }
    }
    placeFormat(candidate, mask);

    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return {
    size,
    modules: best!.map((row) => row.map((cell) => cell === true)),
  };
}

/**
 * The matrix as one SVG path's `d` attribute, one `M…h…v…h…z` per dark module.
 *
 * A single path rather than a rect per module: a version 3 code is 841
 * modules, and that many elements is a real cost in the DOM for something
 * that is one flat shape. Coordinates are in module units, so the caller sets
 * the size with `viewBox` alone.
 */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];

  for (let r = 0; r < matrix.size; r += 1) {
    for (let c = 0; c < matrix.size; c += 1) {
      if (matrix.modules[r]![c]) parts.push(`M${c} ${r}h1v1h-1z`);
    }
  }

  return parts.join("");
}

/**
 * The quiet zone, in modules. Four is the specified minimum and scanners do
 * rely on it — a code rendered flush to a dark panel reads as no code at all.
 */
export const QR_QUIET_ZONE = 4;
