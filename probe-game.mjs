import pkg from "/workspace/node_modules/playwright-core/index.js";
const { chromium } = pkg;
const exe = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
await page.goto("http://127.0.0.1:8080/pages/games/index.html", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".gcard");
await page.locator(".gcard").nth(1).click();
const frame = await (await page.waitForSelector("#playFrame")).contentFrame();
await page.waitForTimeout(4000);
const info = await frame.evaluate(() => {
  const c = document.querySelector("canvas");
  const r = c.getBoundingClientRect();
  return {
    title: document.title,
    frames: ig.system.__frames && ig.system.__frames(),
    running: ig.system.running,
    css: { w: Math.round(r.width), h: Math.round(r.height) },
    attr: { w: c.width, h: c.height },
    view: { w: innerWidth, h: innerHeight },
  };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: "/workspace/screenshots/game-phone-live.png" });
await browser.close();
