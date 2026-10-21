# Cloudflare Turnstile

Bot protection on the media proxy (`/yt/search`, `/yt/audio`, `/spotify/search`,
`/spotify/hits`, `/spotify/file`, `/spotify/audio`, `/spotify/preview`).

- Widget sitekey: `0x4AAAAAAFVncJAeBOvaqWL7` (already created in the Cloudflare
  dashboard — do not create a replacement widget)
- Server gate: `server/turnstile.mjs`, wired in `server/yt-proxy.mjs`
  (`handleMediaRequest`) and called from `src/server.ts`
- Client helper: `public/shared/turnstile.js`

## Behavior

The Worker redeems the browser's `cf-turnstile-response` token once at
`https://challenges.cloudflare.com/turnstile/v0/siteverify` before the proxy
logic runs, requiring `success === true` and a hostname in the allowlist.
Existing handler logic is unchanged — the gate only runs before it.

**Until `TURNSTILE_SECRET` is set the gate stays open** (a warning is logged),
so the site keeps working. Set `TURNSTILE_ENFORCE=1` to fail closed.

## Required configuration (secret never enters the repo)

Set these in the Cloudflare dashboard or via Wrangler, not in files:

```sh
wrangler secret put TURNSTILE_SECRET
```

| Variable | Purpose |
| --- | --- |
| `TURNSTILE_SECRET` | Widget secret from the Cloudflare dashboard (Turnstile → widget). Required to enforce. |
| `TURNSTILE_HOSTNAMES` | Comma-separated frontend hostnames siteverify must match, defaults to `goar.app,www.goar.app`; override for other hostnames. Do not include `localhost` in a production allowlist. |
| `TURNSTILE_ENFORCE` | `1`/`true` to fail closed (including on siteverify network errors). Default: fail open. |
| `TURNSTILE_ACTION` | Optional expected widget action; only set if the frontend always passes `data-action`/`action`. |

## Client usage

```html
<script src="/shared/turnstile.js" async defer></script>
```

```js
const ts = await Turnstile.mount(container, "media");
const token = await ts.token();
await fetch("/yt/search?q=" + encodeURIComponent(q) +
  "&cf-turnstile-response=" + encodeURIComponent(token));
ts.reset(); // tokens are single-use; reset before any retry
```

The token is sent as the `cf-turnstile-response` query param (or header); the
Worker reads either.
