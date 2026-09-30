# Watch player sources

Load order in `index.html`:

1. `extra-sources.js` — collectors
2. `watch.js` — Vidrock decrypt + `#playerVideo` + hls.js + failover
3. `source-hook.js` — no-op if `watch.js` already merged extras

Contract for every source row:

```
{ name, url, format, referer, origin, pngWrap, family }
```

| Family | Names | Where it unlocks |
| --- | --- | --- |
| Vidrock | Nova, Atlas, Luna, Orion, Astra | `watch.js` catalog decrypt |
| Vidcore | Orbit, Supreme, Prime, Premiere 4K, Horizon | resolver `/api/resolve` |
| 111movies | Alpha, NgFlix, … | resolver `POST /api/play` |
| Vidfast | vEdge, … | resolver `/api/resolve` |
| Vidup | Premier, Zenith, CineX, … | resolver `/api/resolve` |
| CineSrc | ranked provider names | resolver `/api/stream/live` |

Not in this picker: live sports, file hosts, anime watch URLs, Ployan page URLs.

DASH rows are skipped so failover continues on HLS/MP4.
