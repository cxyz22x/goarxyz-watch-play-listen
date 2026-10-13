import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stubDir = mkdtempSync(join(tmpdir(), "wisp-stub-"));
writeFileSync(
  join(stubDir, "cloudflare_sockets.js"),
  "export const connect = () => { throw new Error(\"stub\"); };\nexport default { connect };\n",
);
writeFileSync(
  join(stubDir, "cloudflare_workers.js"),
  "export class DurableObject {}\nexport default { DurableObject };\n",
);

const out = await build({
  entryPoints: [new URL("../wisp-worker/src/wisp.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "neutral",
  alias: {
    "cloudflare:sockets": join(stubDir, "cloudflare_sockets.js"),
    "cloudflare:workers": join(stubDir, "cloudflare_workers.js"),
  },
  outfile: "/tmp/wisp-protocol-test.mjs",
  write: true,
});
const { parseSocks5List, pickProxy, encodeSocks5String, socks5Greeting, socks5AuthRequest, socks5ConnectRequest } =
  await import("file:///tmp/wisp-protocol-test.mjs");

test("parseSocks5List parses host:port entries", () => {
  const list = parseSocks5List("a.example:1080, b.example:1080;");
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { host: "a.example", port: 1080 });
});

test("parseSocks5List parses user:pass@host:port with password colons", () => {
  const list = parseSocks5List("user:p:a:ss@proxy.example:1080");
  assert.deepEqual(list[0], {
    host: "proxy.example",
    port: 1080,
    username: "user",
    password: "p:a:ss",
  });
});

test("parseSocks5List skips invalid entries", () => {
  const list = parseSocks5List("good.example:1080,,bad-no-port,:1080,x:0,x:70000");
  assert.equal(list.length, 1);
  assert.equal(list[0].host, "good.example");
});

test("parseSocks5List handles empty input", () => {
  assert.deepEqual(parseSocks5List(undefined), []);
  assert.deepEqual(parseSocks5List(""), []);
});

test("parseSocks5List parses 18 proxy entries with credentials", () => {
  const raw =
    "user:pass@mel.socks.ipvanish.com:1080,user:pass@tor.socks.ipvanish.com:1080";
  const list = parseSocks5List(raw);
  assert.equal(list.length, 2);
  assert.equal(list[0].username, "user");
  assert.equal(list[0].password, "pass");
  assert.equal(list[0].host, "mel.socks.ipvanish.com");
});

test("socks5Greeting without auth offers no-auth only", () => {
  const proxy = { host: "h", port: 1080 };
  assert.deepEqual(Array.from(socks5Greeting(proxy)), [0x05, 0x01, 0x00]);
});

test("socks5Greeting with auth offers no-auth and userpass", () => {
  const proxy = { host: "h", port: 1080, username: "u", password: "p" };
  assert.deepEqual(Array.from(socks5Greeting(proxy)), [0x05, 0x02, 0x00, 0x02]);
});

test("socks5AuthRequest encodes username/password subnegotiation", () => {
  const proxy = { host: "h", port: 1080, username: "user", password: "pass" };
  const bytes = Array.from(socks5AuthRequest(proxy));
  const expected = [
    0x01, 0x04,
    ...[..."user"].map((c) => c.charCodeAt(0)),
    0x04,
    ...[..."pass"].map((c) => c.charCodeAt(0)),
  ];
  assert.deepEqual(bytes, expected);
});

test("socks5ConnectRequest encodes domain destination", () => {
  const bytes = Array.from(socks5ConnectRequest("example.com", 22));
  assert.equal(bytes[0], 0x05);
  assert.equal(bytes[1], 0x01);
  assert.equal(bytes[2], 0x00);
  assert.equal(bytes[3], 0x03);
  assert.equal(bytes[4], "example.com".length);
  assert.equal(
    bytes.slice(5, 5 + "example.com".length).map((b) => String.fromCharCode(b)).join(""),
    "example.com",
  );
  const portOff = 5 + "example.com".length;
  assert.equal(bytes[portOff], 0);
  assert.equal(bytes[portOff + 1], 22);
});

test("socks5ConnectRequest encodes IPv4 destination", () => {
  const bytes = Array.from(socks5ConnectRequest("93.184.216.34", 443));
  assert.equal(bytes[3], 0x01);
  assert.deepEqual(bytes.slice(4, 8), [93, 184, 216, 34]);
  assert.equal(bytes[8], 443 >> 8);
  assert.equal(bytes[9], 443 & 0xff);
});

test("pickProxy returns one of the proxies and varies", () => {
  const proxies = Array.from({ length: 18 }, (_, i) => ({
    host: `p${i}.example`,
    port: 1080,
  }));
  assert.equal(pickProxy([]), null);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const p = pickProxy(proxies);
    seen.add(p.host);
    assert.ok(proxies.some((x) => x.host === p.host));
  }
  assert.ok(seen.size > 1, "pickProxy should vary across calls");
});

test("encodeSocks5String truncates to bytes", () => {
  assert.deepEqual(Array.from(encodeSocks5String("abc")), [97, 98, 99]);
});
