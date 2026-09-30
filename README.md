# goarxyz

Watch, listen, and play. The live site is everything under `public/`.

Contact: admin@goarxyz.com

## Layout

| Path | What it is |
| --- | --- |
| `public/` | Site root for Cloudflare Pages |
| `public/pages/watch` | Movies and TV player (`#playerVideo` + hls.js) |
| `public/pages/watch/watch.js` | Vidrock catalog decrypt, picker, failover |
| `public/pages/watch/extra-sources.js` | Extra families collected into the same player |
| `public/pages/watch/source-hook.js` | Merges extras into resolve/play |
| `public/pages/watch/SOURCES.md` | Family map |
| `public/pages/music` | Music |
| `public/pages/games` | Games |
| `public/games/pack` | Local copies of all 690 games |
| `public/pages/live` | Live TV |
| `public/pages/anime` | Anime |
| `public/legal` | Privacy, terms, copyright, contact |
| `public/vendor` | Local player libraries |
| `functions/api/sources.js` | Same-origin extra source worker |

## Movies / TV player

One player. Load order in `public/pages/watch/index.html`:

1. `extra-sources.js`
2. `watch.js`
3. `source-hook.js`

Vidrock first (Nova, Atlas, Luna, Orion, Astra). Extra families append into the same `#selServer` list and the same failover loop. No iframes.

| Family | Pages env | Unlock route |
| --- | --- | --- |
| Vidcore | `RESOLVER_VIDCORE` | `GET /api/resolve?type&id&server=` |
| 111movies | `RESOLVER_111MOVIES` | `POST /api/play` |
| Vidfast | `RESOLVER_VIDFAST` | `GET /api/resolve?` |
| Vidup | `RESOLVER_VIDUP` | `GET /api/resolve?` |
| CineSrc | `RESOLVER_CINESRC` | `GET /api/stream/live` |

Empty env leaves extras empty. Vidrock still plays.

## Deploy on Cloudflare Pages

Do not use GitHub Pages. Connect this repo in Cloudflare.

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Select `cxyz22x/goarxyz-watch-play-listen`.
3. Framework preset: None.
4. Build command: leave empty.
5. Output directory: `public`.
6. Save and deploy.

That publish uses the files already in `public/`, including the local game packs. It does not rebuild or wipe them.

Optional later: add GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run the Action **Deploy Cloudflare Pages**.

## Run locally

```
npm install
npm run dev
```
