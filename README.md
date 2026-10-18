# goarxyz

Watch, listen, and play. The live site is everything under `public/`.

Contact: admin@goarxyz.com

## Layout

| Path | What it is |
| --- | --- |
| `public/` | Static site — every page is a single self-contained `index.html` |
| `public/pages/watch` | Movies and TV player |
| `public/pages/music` | Music |
| `public/pages/games` | Games (catalog embedded in the page) |
| `public/pages/live` | Live TV |
| `public/pages/anime` | Anime |
| `public/pages/agents` | Terminal over WISP |
| `wisp-worker/` | Standalone WISP (WebSocket Internet Stream Protocol) server on Cloudflare Workers |

## Pages

Every page under `public/` is a single HTML file with all styles and scripts
inlined. No shared asset directories, no build step for the site — what you
see is what's served.

## WISP worker

```sh
cd wisp-worker
npx wrangler deploy
```

Endpoint: `wss://goarxyz-wisp.goarxyz.workers.dev/wisp` (Wisp protocol v1/v2).
Secrets: `WISP_SOCKS5` (optional comma-separated SOCKS5 list), `WISP_TOKEN`
(optional access token). Deployed via the `Deploy WISP Worker` GitHub Actions
workflow.
