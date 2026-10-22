# Production server

TEMPUS runs on one Oracle Cloud VM. This file is the runbook: what is on the
box, how it was set up, and how to ship a new build. No secrets live here —
those stay in `.env.local` (on the Mac and on the server) and in `~/.ssh/`.

## The machine

| | |
|---|---|
| Provider | Oracle Cloud Infrastructure, tenancy `samiylz83`, home region `eu-amsterdam-1` (AD-1) |
| Instance | `instance-20261022-1745` |
| Shape | `VM.Standard.E2.1.Micro` — Always Free, x86_64, 1/8 OCPU (bursts; `nproc` says 2), 1 GB RAM |
| OS | Ubuntu 22.04, user `ubuntu` |
| Disk | 50 GB boot volume (Always Free allows 200 GB total) |
| Swap | 2 GB `/swapfile`, `vm.swappiness=10` |
| Public IP | `92.5.227.153` — **reserved** (`tempus-ip`), survives stop/start |
| Network | `vcn-20261022-1746` / public `subnet-20261022-1746` (10.0.0.0/24), private IP 10.0.0.221 |

**SSH:** `ssh -i ~/.ssh/tempus_oracle ubuntu@92.5.227.153`. The key pair was
generated on the owner's Mac (no passphrase); only the public half is on the
server. Lose the private key and the box is reachable only through the OCI
console's instance console.

**Why this shape:** the Always Free Ampere A1 shape (4 OCPU / 24 GB) was out of
capacity in Amsterdam, and the account stays on Always Free rather than Pay As
You Go. Hetzner was sold out at the time. If A1 capacity appears, the same
setup moves over unchanged (A1 is arm64: rebuild `node_modules` there).

**Free tier caveats:**
- The account started on a 30-day Free Trial; afterwards only Always Free
  resources keep running. Everything above is Always Free-eligible; confirm the
  reserved public IP stays free once the trial ends.
- Oracle may **stop** Always Free instances that sit idle (low CPU, network and
  memory over 7 days). It stops, never deletes — press Start in the console.
  The app and Caddy are enabled services, so they come back on their own.

## Firewalls (two layers — both must allow a port)

1. **OCI security list** `Default Security List for vcn-20261022-1746`, ingress
   from `0.0.0.0/0`: TCP 22, 80, 443 (+ default ICMP). A quick-action NSG
   `ig-quick-action-NSG` (egress only) is also attached to the VNIC.
2. **iptables on the box.** Oracle's Ubuntu image ends INPUT with a `REJECT
   all`; the 80/443 `ACCEPT` rules must sit **above** it (an appended rule never
   matches). Saved with `netfilter-persistent save`.
   Check: `sudo iptables -L INPUT -n --line-numbers`.

## What runs

```
internet :443 / :80  https://tempusplay.com
  → Caddy  /etc/caddy/Caddyfile   (systemd: caddy)
  → 127.0.0.1:3000  next start    (systemd: tempus, /srv/tempus)
```

- **Node 24** from NodeSource, **Caddy 2** from the official apt repo.
- `/etc/systemd/system/tempus.service`: `User=ubuntu`, `WorkingDirectory=/srv/tempus`,
  `NODE_ENV=production`, `NODE_OPTIONS=--max-old-space-size=512`, binds
  127.0.0.1:3000, `Restart=always`, enabled at boot.
- Caddyfile (Caddy obtains and renews the Let's Encrypt certificate itself;
  the IP-only version is kept as `/etc/caddy/Caddyfile.ip-only.bak`):

  ```
  tempusplay.com {
  	encode zstd gzip
  	request_body {
  		max_size 30MB
  	}
  	reverse_proxy 127.0.0.1:3000
  }

  www.tempusplay.com {
  	redir https://tempusplay.com{uri} permanent
  }

  # Bare-IP visitors (old links) go to the domain; no certificate is issued for an IP.
  http://92.5.227.153 {
  	redir https://tempusplay.com{uri} permanent
  }
  ```

  `max_size 30MB` covers the admin panel's 25 MB uploads
  (`serverActions.bodySizeLimit` is 26 MB).
- Caddy ignores a client's own `X-Forwarded-For` and sets its own, which is what
  `TRUSTED_PROXY_HEADER = "x-forwarded-for"` in `lib/admin/client-ip.ts` relies
  on. If Cloudflare's proxy (orange cloud) is ever put in front, switch that
  constant to `cf-connecting-ip`.
- Idle footprint: ~380 MB RAM used with the app running.

Logs: `journalctl -u tempus -f`, `journalctl -u caddy -f`.
Restart: `sudo systemctl restart tempus`.

## Deploying

The 1 GB box cannot run `next build`, so the build happens on the Mac, in a
**separate copy** of the repo (`npm run build` next to a running `npm run dev`
breaks dev — see CLAUDE.md). Runtime dependencies are installed on the server,
so native modules (`sharp`) match its x86_64 Linux.

```bash
npm run deploy        # scripts/deploy.sh: copy, build, ship, restart, smoke test
```

The script copies the repo to `/tmp/tempus-build/app`, swaps in the production
`NEXT_PUBLIC_*` values (they are baked in at build time), builds, rsyncs to
`/srv/tempus`, stops the app, runs `npm ci --omit=dev`, starts it and waits
for `https://tempusplay.com/` to answer 200.

- The server's `/srv/tempus/.env.local` is the production env: it arrives with
  the rsync, so it is whatever the build copy had.
- The production image origin is `https://img.tempusplay.com`, never `/api/r2`
  (that dev proxy answers 404 in production) and no longer `r2.dev`, which
  does not resolve from the owner's network.
- `typescript` and `pg` are runtime `dependencies`, not dev ones: `next start`
  needs `typescript` to load `next.config.ts`, and the cron's
  `scripts/versus-sweep.ts` needs `pg`. With `typescript` missing, the first
  start fails and Next runs a full `npm install` by itself (which also brings
  back every devDependency), so the next restart works and hides the problem.
- Migrations are not part of a deploy: run `npm run db:migrate` from the Mac
  before shipping code that needs them.
- Smoke test: `curl -s -o /dev/null -w "%{http_code}\n" https://tempusplay.com/`.

## Domain and images

- `tempusplay.com` is registered at hosting.com.tr; its nameservers point at
  Cloudflare (`alex` / `kimora.ns.cloudflare.com`), which hosts the DNS zone.
- Apex and `www` are `A` → `92.5.227.153`, **DNS only (grey cloud)**: Caddy
  answers the ACME challenge itself, and `lib/admin/client-ip.ts` trusts
  Caddy's `X-Forwarded-For`. Do not apply Cloudflare's "only allow Cloudflare
  IPs at your origin" advice — visitors reach the box directly.
- `img.tempusplay.com` is the R2 custom domain of `history-images` (R2 →
  Settings → Custom Domains), proxied by Cloudflare.
- The bucket has a CORS rule (GET/HEAD from `https://tempusplay.com`,
  `https://www.tempusplay.com`, `http://localhost:3000`). Plain `<img>` tags do
  not need it, but the home coin's `GLTFLoader` fetches its `.glb` and does.
  A new site origin must be added there.

- Supabase → Authentication → URL Configuration: Site URL
  `https://tempusplay.com`; redirect URLs `https://tempusplay.com/**` and
  `http://localhost:3000/**` (the second keeps dev sign-in links working now
  that the Site URL is production).

## Cron

`crontab -l` (user `ubuntu`): `versus_sweep()` at minute 7 of every hour,
from `/srv/tempus` with its `.env.local` (`SUPABASE_DB_URL`; the direct host is
IPv6-only, so it goes through the session pooler). Output is appended to
`~/versus-sweep.log`, outside `/srv/tempus` so a deploy's `rsync --delete`
leaves it alone.
