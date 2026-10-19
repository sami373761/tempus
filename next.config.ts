import type { NextConfig } from "next";

import { ADMIN_BASE } from "./lib/admin/path.ts";

const r2PublicBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;

/**
 * Hostname of the public image origin, or null when there is none to allow:
 * the base URL may be a same-origin path (`/api/r2`, the dev-only proxy in
 * `app/api/r2/[...key]`), which needs no remote pattern and would throw if
 * handed to `new URL()`.
 */
function r2RemoteHostname(): string | null {
  if (!r2PublicBaseUrl) return null;
  try {
    return new URL(r2PublicBaseUrl).hostname;
  } catch {
    return null;
  }
}

const r2Hostname = r2RemoteHostname();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Phones on the LAN hit dev at `http://<lan-ip>:3000`, and `next dev` refuses
   * cross-origin requests for `/_next/*` from an origin it was not told about —
   * which shows up as a page that loads its HTML and then has no JS or CSS.
   * Head-to-head mode is only testable on two devices, so the LAN subnet has to
   * be allowed here. Dev-only; `next build` ignores it.
   */
  allowedDevOrigins: ["192.168.1.2", "192.168.1.*", "192.168.0.*", "10.0.0.*"],
  /**
   * libheif in WebAssembly, for HEIC profile pictures. Loaded by Node as it
   * ships rather than bundled: the bundler gains nothing on a wasm blob and
   * has broken its loader before. (sharp is on Next's own list already.)
   */
  serverExternalPackages: ["heic-decode", "libheif-js"],
  experimental: {
    serverActions: {
      /* Profile pictures may be up to 4 MB (`AVATAR_MAX_BYTES`), and Next's
         default limit is 1 MB for the whole request — a larger file would be
         refused before the action could say why. Raised to 26 MB for the
         admin panel's image uploads (≤ 25 MB, lib/admin/image-upload.ts):
         the site now runs on its own VPS, not Vercel, whose 4.5 MB request
         ceiling set the old value. Every action still checks its own file
         size (AVATAR_MAX_BYTES stays 4 MB). */
      bodySizeLimit: "26mb",
    },
  },
  /**
   * The admin panel's responses only: never cached, never framed, never
   * leaking the secret address in a Referer, never indexed. Scoped to the
   * panel's path so the public site's caching is untouched.
   */
  async headers() {
    const adminHeaders = [
      { key: "Cache-Control", value: "no-store, max-age=0" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: ADMIN_BASE, headers: adminHeaders },
      { source: `${ADMIN_BASE}/:path*`, headers: adminHeaders },
    ];
  },
  images: {
    // Images live in Cloudflare R2 and are served from its public/CDN hostname.
    remotePatterns: r2Hostname
      ? [
          {
            protocol: "https",
            hostname: r2Hostname,
          },
        ]
      : [],
  },
};

export default nextConfig;
