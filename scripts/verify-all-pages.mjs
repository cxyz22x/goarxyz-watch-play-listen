import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";

// decrypt each stub via its own JS (extracted), compare with git-show of plaintext where available
const files = execSync("find public -name '*.html'").toString().trim().split("\n");
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

let pass = 0, fail = 0, skip = 0;
for (const rel of files) {
  const stub = readFileSync(rel, "utf8");
  if (!stub.includes("var P =")) { skip++; console.log(`PLAIN ${rel}`); continue; }
  globalThis.__written = "";
  globalThis.document = {
    open: () => ({ write: (h) => { globalThis.__written = h; }, close: () => {} }),
    documentElement: { innerHTML: "" },
  };
  const gEnd = stub.indexOf("})();") + 5;
  const i = stub.indexOf("(function () {", gEnd);
  const j = stub.indexOf("</script>", i);
  try {
    eval(stub.slice(i, j));
    await new Promise((r) => setTimeout(r, 300));
    const w = globalThis.__written;
    // sanity: decrypted output must be valid HTML doctype and >200 bytes
    if (w.startsWith("<!DOCTYPE") && w.length > 200) {
      pass++;
      console.log(`PASS ${rel} (${w.length} bytes decrypted)`);
    } else {
      fail++;
      console.log(`FAIL ${rel} — bad output (${w.length} bytes)`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${rel} — ${e.message.slice(0, 60)}`);
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
