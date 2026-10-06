import { encodeQr, qrPath, QR_QUIET_ZONE } from "@/lib/qr";

/**
 * A QR code as inline SVG.
 *
 * Inline rather than an `<img>` for the reason the whole encoder is local: no
 * request leaves the page, so the invite URL — which is the capability to take
 * the second seat — is never handed to anybody's image service. It also means
 * the code is vector, so it stays sharp when a phone camera is held close, and
 * it costs no network round trip on a screen whose whole job is to be ready
 * the instant it opens.
 *
 * **The light modules are painted, not left transparent.** A QR scanner is
 * looking for dark-on-light contrast, and this sits on a dark glass panel over
 * a photograph; a code with a transparent background there is a code that will
 * not scan. The quiet zone is part of the same requirement and part of the same
 * white rectangle.
 */
export function QrCode({
  value,
  size = 160,
  className = "",
}: {
  value: string;
  /** Rendered side in CSS pixels, quiet zone included. */
  size?: number;
  className?: string;
}) {
  const matrix = encodeQr(value);
  const side = matrix.size + QR_QUIET_ZONE * 2;

  return (
    <svg
      viewBox={`0 0 ${side} ${side}`}
      width={size}
      height={size}
      // The URL is already written out beside this on screen, so the code
      // itself is decoration to a screen reader rather than content.
      aria-hidden="true"
      focusable="false"
      className={className}
      // Scanners cope badly with a smoothed code at small sizes.
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <g transform={`translate(${QR_QUIET_ZONE} ${QR_QUIET_ZONE})`}>
        <path d={qrPath(matrix)} fill="#000000" />
      </g>
    </svg>
  );
}
