import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

const pages = [
  "public/index.html",
  "public/pages/AI.Byo/index.html",
  "public/pages/anime/index.html",
  "public/pages/games/index.html",
  "public/pages/home/index.html",
  "public/pages/ip.info/index.html",
  "public/pages/live/index.html",
];

test("actual loader JS (as shipped in the stub) decrypts and writes the original markup", async () => {
  for (const rel of pages) {
    const stub = readFileSync(rel, "utf8");
    const original = readFileSync(".page-src/" + rel, "utf8");
    const gEnd = stub.indexOf("})();") + 5;
    const i = stub.indexOf("(function () {", gEnd);
    const j = stub.indexOf("</script>", i);
    const loader = stub.slice(i, j);

    let written = "";
    globalThis.__written = "";
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    globalThis.document = {
      open: () => ({ write: (h) => { globalThis.__written = h; }, close: () => {} }),
      documentElement: { innerHTML: "" },
    };
    eval(loader);
    await new Promise((r) => setTimeout(r, 100));
    written = globalThis.__written;
    assert.equal(written, original, `${rel} loader must write the original markup`);
    console.log(`  ok ${rel}`);
  }
});
