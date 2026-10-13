import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = "/workspace/github__cxyz22x__goarxyz-watch-play-listen/public";
const PORT = 8823;

const srv = createServer(async (req, res) => {
  let p = new URL(req.url, "http://x").pathname;
  if (p.endsWith("/")) p += "index.html";
  const file = ROOT + p;
  if (existsSync(file)) {
    const data = await readFile(file);
    const type = p.endsWith(".html")
      ? "text/html"
      : p.endsWith(".js")
        ? "text/javascript"
        : p.endsWith(".css")
          ? "text/css"
          : "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  } else {
    res.writeHead(404);
    res.end("nf");
  }
}).listen(PORT);

const pages = [
  "/index.html",
  "/pages/home/index.html",
  "/pages/ip.info/index.html",
  "/pages/games/index.html",
  "/pages/anime/index.html",
  "/pages/live/index.html",
  "/pages/AI.Byo/index.html",
];

const browser = await chromium.launch();
let pass = 0, fail = 0;
for (const path of pages) {
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${PORT}${path}`, {
      waitUntil: "load",
      timeout: 15000,
    });
    await page.waitForFunction(
      () => document.body && document.body.children.length > 0,
      { timeout: 10000 },
    );
    await page.waitForTimeout(300);
    const html = await page.content();
    const title = await page.title();
    const looksOriginal = html.length > 2000;
    const notStub = !html.includes("crypto.subtle.decrypt");
    if (looksOriginal && notStub) {
      pass++;
      console.log(`PASS ${path} (title: ${title}, ${html.length} bytes)`);
    } else {
      fail++;
      console.log(`FAIL ${path} — len=${html.length} stillStub=${!notStub}`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${path} — ${String(e.message).split("\n")[0]}`);
  }
  await page.close();
}
await browser.close();
srv.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
