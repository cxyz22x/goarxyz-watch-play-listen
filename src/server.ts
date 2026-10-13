import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import installPageTemplate from "../scripts/install-page.html?raw";
import { grokOgIdentity } from "virtual:grok-og-identity";
import {
  acceptsHtml,
  createHeadInjector,
  isDocumentPath,
  isInstallQuery,
  renderInstallPageHtml,
  renderWebManifest,
} from "../scripts/grok-pwa-shared.mjs";
import { handleMediaRequest } from "../server/yt-proxy.mjs";


const fetchStart = createStartHandler(defaultStreamHandler);

function requestHost(request: Request): string {
  return (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host
  );
}

function wantsMediaProxy(pathname: string): boolean {
  return (
    pathname.startsWith("/gcdn/") ||
    pathname === "/yt/search" ||
    pathname === "/yt/audio" ||
    pathname === "/spotify/hits" ||
    pathname === "/spotify/preview" ||
    pathname === "/spotify/audio" ||
    pathname === "/spotify/file" ||
    pathname === "/spotify/search"
  );
}

function injectHeadStreaming(response: Response, host: string): Response {
  const injector = createHeadInjector({
    host,
    site: grokOgIdentity.site,
  });
  const transformed = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        for (const out of injector.push(chunk)) controller.enqueue(out);
      },
      flush(controller) {
        for (const out of injector.flush()) controller.enqueue(out);
      },
    }),
  );
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const path = url.pathname;
    const urlWithQuery = path + url.search;
    const host = requestHost(request);

    if (method !== "GET") {
      return fetchStart(request);
    }

    if (wantsMediaProxy(path)) {
      try {
        const response = await handleMediaRequest(url, request.headers);
        if (response) return response;
      } catch {
        return new Response("proxy failed", { status: 502 });
      }
    }

    if (path === "/__grok/manifest.webmanifest" || path === "/__grok/manifest.json") {
      return new Response(renderWebManifest(host), {
        headers: {
          "content-type": "application/manifest+json; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    if (
      isInstallQuery(urlWithQuery) &&
      isDocumentPath(path) &&
      acceptsHtml(request.headers.get("accept"))
    ) {
      const html = renderInstallPageHtml(installPageTemplate, {
        host,
        url: urlWithQuery,
      });
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    const result = await fetchStart(request);
    if (
      result.body &&
      String(result.headers.get("content-type") ?? "").includes("text/html") &&
      !result.headers.get("content-encoding") &&
      isDocumentPath(path)
    ) {
      return injectHeadStreaming(result, host);
    }
    return result;
  },
}
