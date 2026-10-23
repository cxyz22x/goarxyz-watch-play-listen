import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "public", "games.json");
const packRoot = path.join(root, "public", "games", "pack");
const reportPath = path.join(root, "public", "data", "asset-paths.json");

function remoteSlug(game) {
  try {
    const parts = new URL(String(game.remote || "")).pathname.split("/").filter(Boolean);
    const last = parts.at(-1) || "";
    if (last && last !== "index.html" && last !== "game") return last.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
    if (parts.at(-2) && parts.at(-2) !== "game") return parts.at(-2);
  } catch {
    /* no remote */
  }
  return "";
}

function localSlug(game) {
  const packed = String(game.local || game.file || "").match(/\/games\/pack\/([^/]+)\//);
  return packed ? packed[1] : "";
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else found.push(full);
  }
  return found;
}

function gameType(names) {
  if (names.has("api.js") || names.has("base-api.js")) return "platform";
  if (names.has("game.js")) return "canvas";
  return "other";
}

function rewriteText(text, slug, known) {
  const base = "/games/pack/" + slug + "/";
  let count = 0;
  const out = text.replace(
    /(["'(])(\.?\/?)([^"'()\s]+?\.[a-z0-9]{1,8})(?:\?[^"'()\s]*)?/gi,
    (whole, quote, _prefix, rel) => {
      let clean = rel.replace(/^\.\//, "");
      if (clean.startsWith(base)) return whole;
      if (clean.startsWith("/games/pack/" + slug + "/")) return whole;
      if (/^(https?:|data:|blob:|mailto:)/i.test(clean) || clean.startsWith("/")) return whole;
      if (!known.has(clean)) return whole;
      count++;
      return quote + base + clean;
    }
  );
  return { out, count };
}

async function titleOf(dir) {
  const index = path.join(dir, "index.html");
  if (!(await exists(index))) return "";
  const html = await readFile(index, "utf8");
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim().toLowerCase() : "";
}

const raw = (await readFile(catalogPath, "utf8")).trim();
const games = JSON.parse(raw[0] === "[" ? raw : "[" + raw + "]");
const report = [];

for (const game of games) {
  const wanted = remoteSlug(game);
  const stored = localSlug(game);
  let slug = wanted && (await exists(path.join(packRoot, wanted, "index.html"))) ? wanted : stored;
  let source = path.join(packRoot, slug);
  if (!(await exists(path.join(source, "index.html")))) {
    report.push({ id: game.id, slug: wanted || stored, title: game.title, category: game.category || "", error: "pack folder missing" });
    console.log("missing", wanted || stored || game.id);
    continue;
  }
  if (wanted && slug !== wanted) {
    const titled = await titleOf(source);
    const expected = String(game.title || "").trim().toLowerCase();
    if (titled && expected && titled !== expected) {
      report.push({ id: game.id, slug: wanted, title: game.title, category: game.category || "", error: "folder " + slug + " is " + titled });
      console.log("wrong folder", game.title, "found", titled);
      continue;
    }
  }
  const files = await walk(source);
  const known = new Set(files.map((file) => path.relative(source, file).split(path.sep).join("/")));
  const type = gameType(known);
  let changed = 0;
  for (const file of files) {
    if (!/\.(html?|js|css|json)$/i.test(file)) continue;
    const text = await readFile(file, "utf8");
    const { out, count } = rewriteText(text, slug, known);
    if (out !== text) await writeFile(file, out);
    changed += count;
  }
  const play = "/games/pack/" + slug + "/index.html";
  game.local = play;
  game.file = play;
  const cover = [...known].find((name) => /^cover\.(?:jpe?g|png|webp|gif)$/i.test(path.basename(name)) && !name.includes("/"));
  if (cover) game.cover = "/games/pack/" + slug + "/" + cover;
  report.push({ id: game.id, slug, title: game.title, category: game.category || "", type, files: files.length, assetPaths: changed });
  console.log(type, game.category || "-", slug, changed, "asset paths");
}

await writeFile(catalogPath, JSON.stringify(games));
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
const bad = report.filter((row) => row.error);
console.log("done", report.length - bad.length, "aligned", bad.length, "not aligned");
