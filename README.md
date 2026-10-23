# goarxyz

Watch, listen, and play. The live site is everything under `public/`, served by
the app backend in `src/` which also mounts the same-origin media proxy.

Contact: admin@goarxyz.com

## Layout

| Path | What it is |
| --- | --- |
| `public/` | The site: home, watch, music, games, live, anime, tools, legal |
| `public/shared/` | Shared brand styles, floating nav, page protection (aes + protect), Turnstile helper |
| `public/vendor/` | Libraries vendored into the repo so pages do not depend on jsDelivr for playback |
| `public/games.json` | Game catalog (source of truth; the games page embeds a snapshot) |
| `src/` | App backend (TanStack Start) that serves `public/` and mounts the proxy |
| `server/yt-proxy.mjs` | Same-origin media proxy: `/gcdn` (games), `/yt/*`, `/spotify/*` |
| `server/turnstile.mjs` | Cloudflare Turnstile siteverify gate for media proxy endpoints |
| `functions/` | Cloudflare Pages functions (stream sources) |
| `wisp-worker/` | Standalone WISP (WebSocket Internet Stream Protocol) server on Cloudflare Workers |

## Pages

Every page is a single self-contained `index.html` with styles and scripts
inlined, plus the shared stack: `/shared/brand.css`, `/shared/float.css`, and
`/shared/float.js`. The home, anime, and live pages additionally load
`/shared/aes.js` + `/shared/protect.js` (anti-devtools protection).

## Proxy

`server/yt-proxy.mjs` is mounted by `src/server.ts` and handles:

- `/gcdn/*` — games from `cdn-factory.marketjs.com` and `cdn-consumer.marketjs.com`
  (ad slots stubbed/removed), used by the games page theater
- `/yt/search`, `/yt/audio` — YouTube search/audio
- `/spotify/*` — Spotify search, hits, preview/audio files

The `/yt/*` and `/spotify/*` endpoints require a Cloudflare Turnstile token
(`cf-turnstile-response`), verified server-side via siteverify
(`server/turnstile.mjs`). Configure `TURNSTILE_SECRET` to enable the gate.

## Run

```sh
npm install
npm run dev
```

## WISP worker

```sh
cd wisp-worker
npx wrangler deploy
```

Endpoint: `wss://goarxyz-wisp.goarxyz.workers.dev/wisp` (Wisp protocol v1/v2).
Secrets: `WISP_SOCKS5` (optional comma-separated SOCKS5 list), `WISP_TOKEN`
(optional access token). Deployed via the `Deploy WISP Worker` GitHub Actions
workflow.

## Maintenance workflows

- `Fetch games` — fetches game packs into `public/games/pack/` and updates `public/games.json`
- `Align game assets` — aligns local game assets with the catalog
- `Self-contained project` — vendors hls.js into `public/vendor/`, sorts the catalog, removes workspace junk
