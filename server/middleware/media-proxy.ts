/**
 * Same-origin game files and YouTube audio for the deployed server.
 * Dev uses the matching hook in vite.config.ts.
 */
import { handleMediaRequest } from "../yt-proxy.mjs";

interface MediaEvent {
  url: URL;
  req: { method?: string; headers: Headers };
}

function wantsProxy(pathname: string): boolean {
  return pathname.startsWith("/gcdn/") || pathname === "/yt/search" || pathname === "/yt/audio" || pathname === "/spotify/hits" || pathname === "/spotify/preview" || pathname === "/spotify/audio" || pathname === "/spotify/file" || pathname === "/spotify/search";
}

export default async function mediaProxyMiddleware(
  event: MediaEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!wantsProxy(event.url.pathname)) return next();
  if ((event.req.method ?? "GET").toUpperCase() !== "GET") return next();
  try {
    const response = await handleMediaRequest(event.url, event.req.headers);
    return response ?? next();
  } catch {
    return new Response("proxy failed", { status: 502 });
  }
}
