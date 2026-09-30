# goarxyz

Watch, listen, and play. The live site is everything under `public/`.

Contact: admin@goarxyz.com

## Layout

| Path | What it is |
| --- | --- |
| `public/` | Site root for Cloudflare Pages |
| `public/pages/watch` | Movies and TV |
| `public/pages/music` | Music |
| `public/pages/games` | Games |
| `public/games/pack` | Local copies of all 690 games |
| `public/pages/live` | Live TV |
| `public/pages/anime` | Anime |
| `public/legal` | Privacy, terms, copyright, contact |
| `public/vendor` | Local player libraries |

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
