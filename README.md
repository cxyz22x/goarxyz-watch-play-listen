# goarxyz

Watch, listen, and play. This tree is the site itself. Agent notes, screenshots, and build output are not part of it.

## Layout

| Path | What it is |
| --- | --- |
| `public/` | The site: home, movies, shows, music, games, live, anime, legal |
| `public/pages/watch` | Movies and TV |
| `public/pages/music` | Music |
| `public/pages/games` | Games |
| `public/pages/live` | Live TV |
| `public/pages/anime` | Anime |
| `public/legal` | Privacy, terms, copyright, contact |
| `public/vendor` | Libraries fetched into the repo so pages do not depend on jsDelivr for playback |
| `public/data/games-index.json` | Category counts for the game catalog |
| `server/` | Same-origin proxy used by music, live, and games |

Contact: admin@goarxyz.com

## Run

```
npm install
npm run dev
```

Open the home page. The GitHub Action "Self-contained project" vendors hls.js, sorts the game catalog, and removes workspace junk.
