import type { NextConfig } from "next";

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
         refused before the action could say why. 4.5 MB is also Vercel's own
         ceiling on a request body, so this cannot usefully go higher. */
      bodySizeLimit: "4.5mb",
    },
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
