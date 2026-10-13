import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;

function parseStub(html) {
  const P = html.match(/var P = "([^"]+)"/)?.[1];
  const K1 = html.match(/K1 = "([^"]+)"/)?.[1];
  const K2 = html.match(/K2 = "([^"]+)"/)?.[1];
  const IV = html.match(/IV = "([^"]+)"/)?.[1];
  const K = html.match(/ K = "([^"]+)"/)?.[1];
  assert.ok(P && K1 && K2 && IV && K, "all stub fields found");
  return { P, K1, K2, IV, K };
}

// mirrors the browser-side decode chain
function unxor(P, K1, K2) {
  let S = 0;
  let E = "";
  for (let i = 0; i < P.length; i++) {
    const c = P.charCodeAt(i);
    const k1 = K1.charCodeAt(i % K1.length);
    const k2 = K2.charCodeAt((i * 7 + 3) % K2.length);
    S = (S * 31 + c) & 0xff;
    E += String.fromCharCode((c ^ k1 ^ k2 ^ ((i * 13) & 0xff)) & 0xff);
  }
  let mid = "";
  for (let i = 0; i < E.length; i++) {
    const d = E.charCodeAt(i) ^ ((S + i * 29) & 0xff);
    mid += String.fromCharCode(d & 0xff);
  }
  return mid;
}

const pages = [
  "public/index.html",
  "public/pages/AI.Byo/index.html",
  "public/pages/anime/index.html",
  "public/pages/games/index.html",
  "public/pages/home/index.html",
  "public/pages/ip.info/index.html",
  "public/pages/live/index.html",
];

test("every page decrypts through xor x2 + base64 + AES-GCM back to original", async () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    const original = readFileSync(ROOT + ".page-src/" + rel, "utf8");
    const { P, K1, K2, IV, K } = parseStub(stub);

    const mid = unxor(P, K1, K2);
    const aesB64 = Buffer.from(mid, "binary").toString("utf8");

    const cryptoKey = await webcrypto.subtle.importKey(
      "raw",
      new Uint8Array(Buffer.from(K, "base64")),
      { name: "AES-GCM" },
      false,
      ["decrypt"],
    );
    const plain = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(Buffer.from(IV, "base64")) },
      cryptoKey,
      new Uint8Array(Buffer.from(aesB64, "base64")),
    );
    const text = new TextDecoder().decode(plain);
    assert.equal(text, original, `${rel} round-trips exactly`);
  }
});

test("stub leaks nothing readable from the original page", () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    const original = readFileSync(ROOT + ".page-src/" + rel, "utf8");
    const stubNoGuard = stub.slice(0, stub.indexOf("var P ="));
    for (const marker of [
      "<title>goarxyz",
      'class="logo"',
      "float.js",
      "scamalytics",
      "leaflet",
    ]) {
      if (original.includes(marker)) {
        assert.ok(
          !stubNoGuard.includes(marker),
          `${rel} must not leak "${marker}" outside the guard`,
        );
      }
    }
  }
});

test("anti-devtools guard embedded in every stub", () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    assert.ok(stub.includes("debugger;"), `${rel} debugger trap`);
    assert.ok(stub.includes("outerWidth"), `${rel} size detection`);
    assert.ok(stub.includes("F12"), `${rel} F12 block`);
    assert.ok(stub.includes("contextmenu"), `${rel} right-click block`);
  }
});

test("all keys unique per page", () => {
  const keys = new Set();
  const pairs = new Set();
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    const f = parseStub(stub);
    keys.add(f.K);
    pairs.add(f.K1 + "|" + f.K2);
  }
  assert.equal(keys.size, pages.length, "unique AES keys");
  assert.equal(pairs.size, pages.length, "unique XOR key pairs");
});
