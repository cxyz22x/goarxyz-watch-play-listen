import { connect } from "cloudflare:sockets";
import { DurableObject } from "cloudflare:workers";

interface Env {
  WISP_TOKEN?: string;
  WISP_SOCKS5?: string;
}

interface WispMessage {
  type: string;
  destination: string;
  port?: number;
  data?: string;
  streamID?: number;
  reason?: string;
}

interface StreamState {
  socket: Socket;
}

interface Socks5Proxy {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function parseSocks5List(raw: string | undefined): Socks5Proxy[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      let creds: string | undefined;
      let hostPort = entry;
      const at = entry.lastIndexOf("@");
      if (at !== -1) {
        creds = entry.slice(0, at);
        hostPort = entry.slice(at + 1);
      }
      const parts = hostPort.split(":");
      const host = parts.slice(0, -1).join(":");
      const port = Number(parts[parts.length - 1]);
      if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
        return null;
      }
      const proxy: Socks5Proxy = { host, port };
      if (creds) {
        const [username, ...rest] = creds.split(":");
        proxy.username = decodeURIComponent(username);
        proxy.password = decodeURIComponent(rest.join(":"));
      }
      return proxy;
    })
    .filter((p): p is Socks5Proxy => p !== null);
}

export function pickProxy(proxies: Socks5Proxy[]): Socks5Proxy | null {
  if (proxies.length === 0) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

export function encodeSocks5String(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

export function socks5Greeting(proxy: Socks5Proxy): Uint8Array {
  if (proxy.username) {
    return new Uint8Array([0x05, 0x02, 0x00, 0x02]);
  }
  return new Uint8Array([0x05, 0x01, 0x00]);
}

export function socks5AuthRequest(proxy: Socks5Proxy): Uint8Array {
  const user = encodeSocks5String(proxy.username ?? "");
  const pass = encodeSocks5String(proxy.password ?? "");
  const out = new Uint8Array(3 + user.length + pass.length);
  out[0] = 0x01;
  out[1] = user.length;
  out.set(user, 2);
  out[2 + user.length] = pass.length;
  out.set(pass, 3 + user.length);
  return out;
}

export function socks5ConnectRequest(
  destination: string,
  port: number,
): Uint8Array {
  const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(destination);
  let addrBytes: Uint8Array;
  let addrType: number;
  if (isIPv4) {
    addrType = 0x01;
    addrBytes = new Uint8Array(4);
    destination.split(".").forEach((o, i) => {
      addrBytes[i] = Number(o) & 0xff;
    });
  } else {
    addrType = 0x03;
    const name = encodeSocks5String(destination);
    addrBytes = new Uint8Array(1 + name.length);
    addrBytes[0] = name.length;
    addrBytes.set(name, 1);
  }
  const out = new Uint8Array(
    4 + addrBytes.length + 2,
  );
  out[0] = 0x05;
  out[1] = 0x01;
  out[2] = 0x00;
  out[3] = addrType;
  out.set(addrBytes, 4);
  const portHi = (port >> 8) & 0xff;
  const portLo = port & 0xff;
  out[4 + addrBytes.length] = portHi;
  out[5 + addrBytes.length] = portLo;
  return out;
}

async function readExact(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  length: number,
): Promise<Uint8Array> {
  const out = new Uint8Array(length);
  let filled = 0;
  while (filled < length) {
    const { done, value } = await reader.read();
    if (done) throw new Error("socks5 proxy closed early");
    if (!value) continue;
    out.set(value.subarray(0, Math.min(value.length, length - filled)), filled);
    filled += value.length;
    if (filled > length) {
      throw new Error("socks5 proxy sent more than expected");
    }
  }
  return out;
}

async function dialThroughSocks5(
  proxy: Socks5Proxy,
  destination: string,
  port: number,
): Promise<Socket> {
  const socket = connect({ hostname: proxy.host, port: proxy.port });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  try {
    await writer.write(socks5Greeting(proxy));
    const methods = await readExact(reader, 2);
    if (methods[0] !== 0x05) throw new Error("not a socks5 proxy");
    if (methods[1] === 0xff) throw new Error("socks5 proxy rejected auth");
    if (methods[1] === 0x02) {
      if (!proxy.username) throw new Error("socks5 proxy wants auth");
      await writer.write(socks5AuthRequest(proxy));
      const auth = await readExact(reader, 2);
      if (auth[1] !== 0x00) throw new Error("socks5 auth failed");
    } else if (methods[1] !== 0x00) {
      throw new Error("socks5 proxy sent unknown method");
    }
    await writer.write(socks5ConnectRequest(destination, port));
    const head = await readExact(reader, 4);
    if (head[1] !== 0x00) {
      throw new Error(`socks5 connect failed (code ${head[1]})`);
    }
    const addrType = head[3];
    let skip: number;
    if (addrType === 0x01) skip = 4;
    else if (addrType === 0x03) {
      const lenByte = await readExact(reader, 1);
      skip = lenByte[0];
    } else if (addrType === 0x04) skip = 16;
    else throw new Error("socks5 proxy sent unknown addr type");
    await readExact(reader, skip + 2);
    return socket;
  } finally {
    writer.releaseLock();
    reader.releaseLock();
  }
}

export class WispServer extends DurableObject<Env> {
  private streams = new Map<number, StreamState>();
  private nextStreamId = 1;

  private authorized(request: Request): boolean {
    const expected = this.env.WISP_TOKEN?.trim();
    if (!expected) return true;
    const url = new URL(request.url);
    const token =
      request.headers.get("x-wisp-token") ??
      url.searchParams.get("token") ??
      "";
    if (token.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < token.length; i++) {
      diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    return diff === 0;
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!this.authorized(request)) {
      return new Response("unauthorized", { status: 401 });
    }

    const proxies = parseSocks5List(this.env.WISP_SOCKS5);
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const send = (msg: Record<string, unknown>) => {
      try {
        server.send(JSON.stringify(msg));
      } catch {
        /* connection gone */
      }
    };

    const cleanupStream = async (id: number) => {
      const state = this.streams.get(id);
      if (!state) return;
      this.streams.delete(id);
      try {
        await state.socket.close();
      } catch {
        /* already closed */
      }
    };

    server.addEventListener("message", (event) => {
      let msg: WispMessage;
      try {
        msg = JSON.parse(String(event.data)) as WispMessage;
      } catch {
        return;
      }

      if (msg.type === "connect") {
        const id = this.nextStreamId++;
        const destination = String(msg.destination ?? "");
        const port = Number(msg.port ?? 443);
        if (
          !destination ||
          !Number.isInteger(port) ||
          port < 1 ||
          port > 65535
        ) {
          send({ type: "error", streamID: id, reason: "invalid destination" });
          return;
        }
        void (async () => {
          let socket: Socket | null = null;
          let lastError: unknown = null;
          const attempts = Math.min(proxies.length, 3);
          for (let attempt = 0; attempt < attempts && !socket; attempt++) {
            const proxy = pickProxy(proxies);
            if (!proxy) break;
            try {
              socket = await dialThroughSocks5(proxy, destination, port);
            } catch (err) {
              lastError = err;
            }
          }
          if (!socket) {
            try {
              socket = connect({ hostname: destination, port });
            } catch (err) {
              lastError = err;
            }
          }
          if (!socket) {
            send({
              type: "error",
              streamID: id,
              reason: String((lastError as Error)?.message ?? lastError),
            });
            return;
          }
          this.streams.set(id, { socket });
          send({ type: "connected", streamID: id });
          const reader = socket.readable.getReader();
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                send({
                  type: "data",
                  streamID: id,
                  data: this.bytesToBase64(value as Uint8Array),
                });
              }
            }
          } catch {
            /* read error */
          }
          send({ type: "close", streamID: id, reason: "stream ended" });
          await cleanupStream(id);
        })();
        return;
      }

      if (msg.type === "data" || msg.type === "continue") {
        if (msg.type === "data") {
          const state = this.streams.get(msg.streamID ?? -1);
          if (state && msg.data) {
            const writer = state.socket.writable.getWriter();
            void writer
              .write(this.base64ToBytes(msg.data))
              .catch(() => {})
              .finally(() => writer.releaseLock());
          }
        }
        return;
      }

      if (msg.type === "close" || msg.type === "disconnect") {
        const id = msg.streamID ?? -1;
        void cleanupStream(id).then(() => {
          send({ type: "close", streamID: id, reason: msg.reason ?? "closed" });
        });
      }
    });

    server.addEventListener("close", () => {
      for (const id of [...this.streams.keys()]) void cleanupStream(id);
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default WispServer;
