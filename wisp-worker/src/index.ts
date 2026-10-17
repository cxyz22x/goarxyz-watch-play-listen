import { WispServer } from "./wisp";
export { WispServer };

interface Env {
  WISP: DurableObjectNamespace;
  WISP_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/wisp" || path === "/") {
      if (request.headers.get("upgrade") !== "websocket") {
        return new Response("wisp over websocket \u2014 see /health", {
          status: 426,
        });
      }
      if (env.WISP_TOKEN) {
        const token =
          request.headers.get("x-wisp-token") ??
          url.searchParams.get("token") ??
          "";
        if (token !== env.WISP_TOKEN) {
          return new Response("unauthorized", { status: 401 });
        }
      }
      const stub = env.WISP.get(env.WISP.idFromName("wisp"));
      return stub.fetch(request);
    }
    if (path === "/health") {
      return new Response("ok", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  },
};
