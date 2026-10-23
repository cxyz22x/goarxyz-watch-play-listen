import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packRoot = path.join(root, "public", "games", "pack");
const catalogPath = path.join(root, "public", "games.json");
const reportPath = path.join(root, "public", "data", "games-fetch.json");
const UA = { "user-agent": "Mozilla/5.0", accept: "*/*" };
const offset = Math.max(0, Number(process.env.FETCH_OFFSET || 0) || 0);
const limit = Math.max(1, Number(process.env.FETCH_LIMIT || 690) || 690);
const commitEvery = Math.max(5, Number(process.env.FETCH_COMMIT_EVERY || 20) || 20);

function slugFrom(file) {
  try {
    const u = new URL(file, "https://cdn-factory.marketjs.com");
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p === "en" || p === "id" || p === "zh");
    const name = i >= 0 ? parts[i + 1] : parts[parts.length - 2] || parts.at(-1);
    return String(name || "game").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
  } catch {
    return "game";
  }
}

function originDir(file) {
  const u = new URL(file, "https://cdn-factory.marketjs.com");
  return u.origin + u.pathname.replace(/[^/]*$/, "");
}

function refsFrom(text) {
  const out = new Set();
  const add = (p) => {
    p = String(p || "").split(/[?#]/)[0].trim();
    if (!p || p.startsWith("data:") || p.startsWith("http") || p.startsWith("//") || p.startsWith("#")) return;
    if (p.startsWith("/")) return;
    out.add(p.replace(/^\.\//, ""));
  };
  for (const m of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/url\((['"]?)([^'")]+)\1\)/gi)) add(m[2]);
  for (const m of text.matchAll(/["'](media\/[a-z0-9_./-]+\.(?:png|jpe?g|gif|webp|svg|mp3|ogg|m4a|wav|json|fnt|ttf|woff2?|css|js))["']/gi)) add(m[1]);
  add("game.js");
  add("game.css");
  add("media/graphics/orientate/portrait.jpg");
  add("media/graphics/orientate/landscape.jpg");
  add("media/graphics/misc/favicon.ico");
  return [...out];
}

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(res.status + " " + url);
  return Buffer.from(await res.arrayBuffer());
}

async function save(dest, buf) {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buf);
}

async function packGame(game) {
  const remote = game.remote || (String(game.file || "").includes("marketjs.com") ? game.file : "");
  const slug = slugFrom(remote || game.file);
  const dest = path.join(packRoot, slug);
  const indexDest = path.join(dest, "index.html");
  const local = "/games/pack/" + slug + "/index.html";
  if (existsSync(indexDest) && existsSync(path.join(dest, "game.js"))) {
    return { slug, files: 0, skipped: true, local, remote };
  }
  if (!remote) throw new Error("no remote url");
  const base = originDir(remote);
  const html = (await get(remote)).toString("utf8");
  await save(indexDest, html);
  const queue = refsFrom(html);
  const seen = new Set();
  let files = 1;
  while (queue.length) {
    const rel = queue.shift();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const destFile = path.join(dest, rel);
    if (existsSync(destFile)) continue;
    try {
      const buf = await get(base + rel);
      if (buf.byteLength > 90 * 1024 * 1024) continue;
      await save(destFile, buf);
      files++;
      const low = rel.toLowerCase();
      if (/\.(html?|js|css)$/.test(low)) {
        for (const extra of refsFrom(buf.toString("utf8"))) {
          const joined = path.posix.normalize(path.posix.dirname(rel) === "." ? extra : path.posix.join(path.posix.dirname(rel), extra));
          if (!seen.has(joined) && !joined.startsWith("..")) queue.push(joined);
        }
      }
    } catch {
      /* missing asset */
    }
  }
  if (game.cover) {
    try {
      const cover = await get(game.cover);
      const ext = (game.cover.match(/\.(png|jpe?g|webp|gif)/i) || ["", "jpg"])[1];
      await save(path.join(dest, "cover." + ext), cover);
      files++;
      game.cover = "/games/pack/" + slug + "/cover." + ext;
    } catch {
      /* keep remote cover */
    }
  }
  return { slug, files, skipped: false, local, remote };
}

const raw = (await readFile(catalogPath, "utf8")).trim();
const games = JSON.parse(raw[0] === "[" ? raw : "[" + raw + "]");
const slice = games.slice(offset, offset + limit);
const report = existsSync(reportPath) ? JSON.parse(await readFile(reportPath, "utf8")) : { ok: 0, fail: [], packs: 0 };
let n = 0;
for (const game of slice) {
  n++;
  try {
    const out = await packGame(game);
    game.local = out.local;
    game.remote = out.remote || game.remote;
    game.file = out.local;
    report.ok++;
    report.packs++;
    console.log((offset + n) + "/" + games.length, game.title, out.skipped ? "have" : out.files + " files");
  } catch (err) {
    report.fail.push({ id: game.id, title: game.title, error: String(err.message || err) });
    console.log("fail", game.title, err.message || err);
  }
  if (n % commitEvery === 0) {
    await writeFile(catalogPath, JSON.stringify(games));
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  }
}
await writeFile(catalogPath, JSON.stringify(games));
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log("done ok", report.ok, "fail", report.fail.length);
