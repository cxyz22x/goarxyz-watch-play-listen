# Watch player sources

One player: `#playerVideo` + hls.js.

Load order in `index.html`:

1. `extra-sources.js` — collect extra family rows
2. `watch.js` — Vidrock decrypt + play + failover
3. `source-hook.js` — merge extras into that same list

Contract for every source row:

```
{ name, url, format, referer, origin, pngWrap, family }
```

| Family | Names | Where it unlocks |
| --- | --- | --- |
| Vidrock | Nova, Atlas, Luna, Orion, Astra | catalog decrypt in watch.js |
| Vidcore | Orbit, Supreme, Prime, Premiere 4K, Horizon | `/api/sources` or `RESOLVER_VIDCORE` |
| 111movies | Alpha, NgFlix, … | `/api/sources` or `RESOLVER_111MOVIES` |
| Vidfast | vEdge, … | `/api/sources` or `RESOLVER_VIDFAST` |
| Vidup | Premier, Zenith, CineX, … | `/api/sources` or `RESOLVER_VIDUP` |
| CineSrc | ranked provider names | `/api/sources` or `RESOLVER_CINESRC` `/api/stream/live` |

Not in this picker: live sports, file hosts, anime watch URLs, Ployan page URLs.

DASH rows are skipped so failover continues on HLS/MP4.
