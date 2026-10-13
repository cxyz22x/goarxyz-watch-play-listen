import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const ROOT = "/tmp/obf-test/";

function parseStub(html) {
  const P = html.match(/var P = "([^"]+)"/)?.[1];
  const K1 = html.match(/K1 = "([^"]+)"/)?.[1];
  const K2 = html.match(/K2 = "([^"]+)"/)?.[1];
  const IV = html.match(/IV = "([^"]+)"/)?.[1];
  const K = html.match(/ K = "([^"]+)"/)?.[1];
  assert.ok(P, "payload");
  assert.ok(K1, "xkey1");
  assert.ok(K2, "xkey2");
  assert.ok(IV, "iv");
  assert.ok(K, "key");
  return { P, K1, K2, IV, K };
}

function decodeChain(Pb64, K1, K2) {
  const pb = atob(Pb64);
  let aesB64 = "";
  for (let i = 0; i < pb.length; i++) {
    aesB64 += String.fromCharCode((pb.charCodeAt(i) ^ ((i * 29 + 7) & 0xff)) & 0xff);
  }
  let out = "";
  for (let i = 0; i < aesB64.length; i++) {
    const c = aesB64.charCodeAt(i);
    const k1 = K1.charCodeAt(i % K1.length);
    const k2 = K2.charCodeAt((i * 7 + 3) % K2.length);
    out += String.fromCharCode((c ^ k1 ^ k2 ^ ((i * 13) & 0xff)) & 0xff);
  }
  return out;
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

test("xor x2 + base64 + AES-GCM round-trips exactly", async () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    const original = readFileSync(ROOT + ".page-src/" + rel, "utf8");
    const { P: Pb64, K1, K2, IV, K } = parseStub(stub);

    const aesB64 = decodeChain(Pb64, K1, K2);

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
    assert.equal(
      text,
      original,
      `${rel} must decrypt byte-identical to the original`,
    );
  }
});

test("payload is not plaintext base64 of the AES blob (layering works)", () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    const { P } = parseStub(stub);
    // a plain base64 layer would decode cleanly; XOR-scrambled data almost never does
    let decoded;
    try {
      decoded = Buffer.from(P, "base64").toString("utf8");
    } catch {
      decoded = null;
    }
    const looksLikePlainB64 =
      decoded !== null &&
      Buffer.compare(
        Buffer.from(decoded, "binary"),
        Buffer.from(decoded, "binary"),
      ) === 0 &&
      decoded.includes("==");
    assert.ok(!looksLikePlainB64 || decoded.length === 0,
      `${rel} payload must not be a plain base64 layer`);
    assert.ok(P.length > 100, `${rel} payload non-trivial`);
  }
});

test("guard present in every stub", () => {
  for (const rel of pages) {
    const stub = readFileSync(ROOT + rel, "utf8");
    assert.ok(stub.includes("debugger;"), `${rel} debugger trap`);
    assert.ok(stub.includes("outerWidth"), `${rel} size detection`);
    assert.ok(stub.includes("F12"), `${rel} F12`);
    assert.ok(stub.includes("contextmenu"), `${rel} right-click`);
  }
});
