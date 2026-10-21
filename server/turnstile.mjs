/**
 * Cloudflare Turnstile server-side verification (canonical siteverify flow).
 *
 * The widget (sitekey 0x4AAAAAAFVncJAeBOvaqWL7) renders client-side and produces
 * a single-use `cf-turnstile-response` token, which the browser sends with the
 * request (query param or header). The Worker redeems it once at
 * challenges.cloudflare.com/turnstile/v0/siteverify before the existing proxy
 * logic runs — gate, don't replace.
 *
 * Secrets live in the environment: TURNSTILE_SECRET (required to enforce),
 * TURNSTILE_HOSTNAMES (comma-separated frontend hostname allowlist),
 * TURNSTILE_ENFORCE ("1"/"true" to fail closed). While TURNSTILE_SECRET is not
 * configured the gate stays open and logs a warning, so the site keeps working
 * until `wrangler secret put TURNSTILE_SECRET` (or .dev.vars) is done.
 */

export const TURNSTILE_SITEKEY = "0x4AAAAAAFVncJAeBOvaqWL7";
export const TURNSTILE_TOKEN_PARAM = "cf-turnstile-response";
export const TURNSTILE_TOKEN_HEADER = "cf-turnstile-response";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function envFlag(name) {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

const DEFAULT_HOSTNAMES = "goar.app,www.goar.app";

function expectedHostnames() {
  const list = (process.env.TURNSTILE_HOSTNAMES ?? DEFAULT_HOSTNAMES)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
}

function turnstileSecret() {
  const secret = (process.env.TURNSTILE_SECRET ?? "").trim();
  return secret || null;
}

export function turnstileConfigured() {
  return turnstileSecret() !== null;
}

function clientIp(request) {
  const fwd = request.headers.get("cf-connecting-ip");
  if (fwd) return fwd;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
  );
}

function tokenFromRequest(url, request) {
  const fromQuery = url.searchParams.get(TURNSTILE_TOKEN_PARAM)?.trim();
  if (fromQuery) return fromQuery;
  const fromHeader = request.headers.get(TURNSTILE_TOKEN_HEADER)?.trim();
  if (fromHeader) return fromHeader;
  return null;
}

/**
 * Verify the Turnstile token carried by `request`. Returns null when the
 * request may proceed (token valid, or gate not configured / not enforced),
 * or a Response to return when the request must be rejected.
 */
export async function verifyTurnstile(request) {
  const secret = turnstileSecret();
  if (!secret) {
    console.warn(
      "[turnstile] TURNSTILE_SECRET is not set — bot gate is OPEN until it is configured",
    );
    return null;
  }

  const url = new URL(request.url);
  const token = tokenFromRequest(url, request);
  const hostnames = expectedHostnames();
  const expectedAction = (process.env.TURNSTILE_ACTION ?? "").trim() || null;

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    hostnames.size === 0
  ) {
    return new Response("forbidden", { status: 403 });
  }

  let result;
  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });
    const ip = clientIp(request);
    if (ip) body.set("remoteip", ip);
    const r = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body,
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch (err) {
    if (envFlag("TURNSTILE_ENFORCE")) {
      return new Response("forbidden", { status: 403 });
    }
    console.warn("[turnstile] siteverify failed, failing open:", String(err));
    return null;
  }

  const ok =
    result.success === true &&
    (!expectedAction || result.action === expectedAction) &&
    hostnames.has(String(result.hostname ?? "").toLowerCase());
  if (!ok) {
    return new Response("forbidden", { status: 403 });
  }
  return null;
}
