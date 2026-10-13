# goarxyz-wisp

Standalone WISP (WebSocket Internet Stream Protocol) server on Cloudflare Workers. Any port, any TCP destination, with optional random-per-connection SOCKS5 rotation and automatic failover.

## Deploy

```sh
cd wisp-worker
npx wrangler deploy
```

The endpoint will be `wss://goarxyz-wisp.<your-subdomain>.workers.dev/` (add a custom route/domain in the Cloudflare dashboard if you want `wss://wisp.yourdomain.com/`).

## Configuration

Set secrets (never commit these):

```sh
npx wrangler secret put WISP_SOCKS5   # comma-separated: user:pass@host:port,...
npx wrangler secret put WISP_TOKEN   # optional; if set, clients pass ?token=... or x-wisp-token header
```

- `WISP_SOCKS5` unset/empty → all connections dial direct.
- `WISP_SOCKS5` set → each connection picks a random proxy; on failure it retries up to 2 more random proxies, then falls back to direct.

## Endpoints

- `wss://.../` or `wss://.../wisp` — WISP over WebSocket
- `GET /health` — returns 200 ok

## Client usage

Standard WISP JSON messages over WebSocket:

```json
{"type":"connect","destination":"example.com","port":22}
{"type":"data","streamID":1,"data":"<base64>"}
{"type":"continue","streamID":1}
{"type":"close","streamID":1}
```

Responses: `connected`, `data`, `close`, `error`. Works with libcurl.js (`set_websocket`), any WISP client, SSH tunnels (port 22), and arbitrary TCP.

## Local dev

```sh
cd wisp-worker
echo 'WISP_SOCKS5=' > .dev.vars   # or leave unset for direct dial
npx wrangler dev
```
