import { connect } from "cloudflare:sockets";
import { DurableObject } from "cloudflare:workers";

interface Env {
  WISP_TOKEN?: string;
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
        if (!destination || !Number.isInteger(port) || port < 1 || port > 65535) {
          send({ type: "error", streamID: id, reason: "invalid destination" });
          return;
        }
        try {
          const socket = connect({ hostname: destination, port });
          this.streams.set(id, { socket });
          send({ type: "connected", streamID: id });
          const reader = socket.readable.getReader();
          void (async () => {
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
        } catch (err) {
          send({
            type: "error",
            streamID: id,
            reason: String((err as Error)?.message ?? err),
          });
          void cleanupStream(id);
        }
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
