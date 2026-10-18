import { connect } from "cloudflare:sockets";
import { DurableObject } from "cloudflare:workers";

interface Env {
  WISP_TOKEN?: string;
  WISP_SOCKS5?: string;
}

const STREAM_ID_HANDSHAKE = 0;
const MAX_BUFFER = 64;

const PACKET_CONNECT = 0x01;
const PACKET_DATA = 0x02;
const PACKET_CONTINUE = 0x03;
const PACKET_CLOSE = 0x04;
const PACKET_INFO = 0x05;

const STREAM_TCP = 0x01;
const STREAM_UDP = 0x02;

const EXTENSION_UDP = 0x01;

const CLOSE_UNKNOWN = 0x01;
const CLOSE_NETWORK_ERROR = 0x03;
const CLOSE_INVALID_INFO = 0x41;
const CLOSE_UNREACHABLE = 0x42;
const CLOSE_REFUSED = 0x44;
const CLOSE_THROTTLED = 0x49;

interface Socks5Proxy {
  host: string;
  port: number;
  username?: string;
  password?: string;
}

interface Stream {
  socket: Socket;
  pending: Uint8Array[];
  writing: boolean;
  closed: boolean;
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

function encodeSocks5String(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function socks5Greeting(proxy: Socks5Proxy): Uint8Array {
  if (proxy.username) {
    return new Uint8Array([0x05, 0x02, 0x00, 0x02]);
  }
  return new Uint8Array([0x05, 0x01, 0x00]);
}

function socks5AuthRequest(proxy: Socks5Proxy): Uint8Array {
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

function socks5ConnectRequest(
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
  const out = new Uint8Array(4 + addrBytes.length + 2);
  out[0] = 0x05;
  out[1] = 0x01;
  out[2] = 0x00;
  out[3] = addrType;
  out.set(addrBytes, 4);
  out[4 + addrBytes.length] = (port >> 8) & 0xff;
  out[5 + addrBytes.length] = port & 0xff;
  return out;
}

class ByteReader {
  private buffer: Uint8Array;

  constructor(payload: Uint8Array) {
    this.buffer = payload;
  }

  private take(length: number): Uint8Array {
    if (this.buffer.length < length) throw new Error("payload too short");
    const out = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return out;
  }

  u8(): number {
    return this.take(1)[0];
  }

  u16(): number {
    const b = this.take(2);
    return b[0] | (b[1] << 8);
  }

  rest(): Uint8Array {
    return this.take(this.buffer.length);
  }

  string(): string {
    return new TextDecoder().decode(this.rest());
  }
}

class PacketBuilder {
  private bytes: number[] = [];

  constructor(type: number, streamId: number) {
    this.bytes.push(type & 0xff);
    this.bytes.push(streamId & 0xff);
    this.bytes.push((streamId >>> 8) & 0xff);
    this.bytes.push((streamId >>> 16) & 0xff);
    this.bytes.push((streamId >>> 24) & 0xff);
  }

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    this.bytes.push(value & 0xff);
    this.bytes.push((value >> 8) & 0xff);
    return this;
  }

  u32(value: number): this {
    this.bytes.push(value & 0xff);
    this.bytes.push((value >> 8) & 0xff);
    this.bytes.push((value >> 16) & 0xff);
    this.bytes.push((value >>> 24) & 0xff);
    return this;
  }

  bytesFromArray(data: Uint8Array): this {
    for (const byte of data) this.bytes.push(byte);
    return this;
  }

  string(value: string): this {
    return this.bytesFromArray(
      new TextEncoder().encode(value),
    );
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
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
    const copy = Math.min(value.length, length - filled);
    out.set(value.subarray(0, copy), filled);
    filled += copy;
    if (value.length > copy) {
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
  private streams = new Map<number, Stream>();

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

  private async flushStream(stream: Stream): Promise<void> {
    if (stream.writing || stream.closed) return;
    stream.writing = true;
    try {
      while (stream.pending.length > 0 && !stream.closed) {
        const chunk = stream.pending.shift()!;
        const writer = stream.socket.writable.getWriter();
        try {
          await writer.write(chunk);
        } finally {
          writer.releaseLock();
        }
      }
    } catch {
      stream.closed = true;
    } finally {
      stream.writing = false;
    }
  }

  private async closeStream(
    send: (data: Uint8Array) => void,
    id: number,
    reason: number,
  ): Promise<void> {
    const stream = this.streams.get(id);
    if (stream) {
      stream.closed = true;
      this.streams.delete(id);
      try {
        await stream.socket.close();
      } catch {
        /* already closed */
      }
    }
    send(new PacketBuilder(PACKET_CLOSE, id).u8(reason).build());
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    if (!this.authorized(request)) {
      return new Response("unauthorized", { status: 401 });
    }

    const proxies = parseSocks5List(this.env.WISP_SOCKS5);
    const v2 = request.headers.get("sec-websocket-protocol") !== null;
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const send = (data: Uint8Array) => {
      try {
        server.send(data);
      } catch {
        /* connection gone */
      }
    };

    if (v2) {
      const info = new PacketBuilder(PACKET_INFO, STREAM_ID_HANDSHAKE)
        .u8(2)
        .u8(1)
        .build();
      send(info);
    } else {
      send(
        new PacketBuilder(PACKET_CONTINUE, STREAM_ID_HANDSHAKE)
          .u32(MAX_BUFFER)
          .build(),
      );
    }

    server.addEventListener("message", (event) => {
      void (async () => {
      const raw = event.data as unknown;
      let data: Uint8Array;
      if (typeof raw === "string") {
        data = new TextEncoder().encode(raw);
      } else if (raw instanceof ArrayBuffer) {
        data = new Uint8Array(raw);
      } else if (raw instanceof Uint8Array) {
        data = raw;
      } else {
        data = new Uint8Array(await (raw as Blob).arrayBuffer());
      }
      if (data.length < 5) return;
      const type = data[0];
      const streamId =
        data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
      const payload = data.subarray(5);

      if (type === PACKET_CONNECT) {
        void (async () => {
          let port: number;
          let destination: string;
          let streamType: number;
          try {
            const reader = new ByteReader(payload);
            streamType = reader.u8();
            port = reader.u16();
            destination = reader.string();
          } catch (err) {
            send(
              new PacketBuilder(PACKET_CLOSE, streamId)
                .u8(CLOSE_INVALID_INFO)
                .build(),
            );
            return;
          }
          if (streamType !== STREAM_TCP || !destination) {
            send(
              new PacketBuilder(PACKET_CLOSE, streamId)
                .u8(CLOSE_INVALID_INFO)
                .build(),
            );
            return;
          }
          if (this.streams.has(streamId)) {
            send(
              new PacketBuilder(PACKET_CLOSE, streamId)
                .u8(CLOSE_THROTTLED)
                .build(),
            );
            return;
          }

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
            const message = String((lastError as Error)?.message ?? lastError);
            let reason = CLOSE_UNREACHABLE;
            if (/refus|reset/i.test(message)) reason = CLOSE_REFUSED;
            else if (/timed?\s?out/i.test(message)) reason = CLOSE_REFUSED;
            else if (/more than expected|not a socks5|auth/i.test(message)) {
              reason = CLOSE_NETWORK_ERROR;
            }
            send(
              new PacketBuilder(PACKET_CLOSE, streamId).u8(reason).build(),
            );
            return;
          }

          const stream: Stream = {
            socket,
            pending: [],
            writing: false,
            closed: false,
          };
          this.streams.set(streamId, stream);
          void (async () => {
            const reader = stream.socket.readable.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done || stream.closed) break;
                if (value) {
                  send(
                    new PacketBuilder(PACKET_DATA, streamId)
                      .bytesFromArray(value as Uint8Array)
                      .build(),
                  );
                }
              }
            } catch {
              /* read error */
            }
            await this.closeStream(send, streamId, CLOSE_UNKNOWN);
          })();
        })();
        return;
      }

      if (type === PACKET_DATA) {
        const stream = this.streams.get(streamId);
        if (stream && !stream.closed && payload.length > 0) {
          stream.pending.push(payload);
          void this.flushStream(stream);
        }
        send(
          new PacketBuilder(PACKET_CONTINUE, streamId).u32(MAX_BUFFER).build(),
        );
        return;
      }

      if (type === PACKET_CONTINUE) {
        return;
      }

      if (type === PACKET_CLOSE) {
        const reason = payload.length > 0 ? payload[0] : CLOSE_UNKNOWN;
        void this.closeStream(send, streamId, reason);
        return;
      }

      if (type === PACKET_INFO) {
        if (v2 && streamId === STREAM_ID_HANDSHAKE) {
          send(
            new PacketBuilder(PACKET_CONTINUE, STREAM_ID_HANDSHAKE)
              .u32(MAX_BUFFER)
              .build(),
          );
        }
        return;
      }
      })();
    });

    server.addEventListener("close", () => {
      for (const id of [...this.streams.keys()]) {
        const stream = this.streams.get(id);
        if (!stream) continue;
        stream.closed = true;
        this.streams.delete(id);
        try {
          void stream.socket.close();
        } catch {
          /* already closed */
        }
      }
    });

    return new Response(null, { status: 101, webSocket: client });
  }
}

export default WispServer;
