import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const onActions = process.env.GITHUB_ACTIONS === "true";

async function fetchTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch " + res.status + " " + url);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log("vendored", path.relative(root, dest));
}

async function walk(dir, visit) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") continue;
      await walk(full, visit);
    } else {
      await visit(full);
    }
  }
}

async function cleanGames() {
  const file = path.join(root, "public", "games.json");
  if (!existsSync(file)) return;
  const raw = (await readFile(file, "utf8")).trim();
  const data = JSON.parse(raw[0] === "[" ? raw : "[" + raw + "]");
  const seen = new Set();
  const games = data
    .filter((g) => g && g.id && g.title && g.file)
    .map((g) => ({
      id: String(g.id),
      title: String(g.title),
      category: String(g.category || "arcade"),
      cover: String(g.cover || ""),
      file: String(g.file),
    }))
    .filter((g) => (seen.has(g.id) ? false : seen.add(g.id)))
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  await writeFile(file, JSON.stringify(games));
  const counts = {};
  for (const g of games) counts[g.category] = (counts[g.category] || 0) + 1;
  await mkdir(path.join(root, "public", "data"), { recursive: true });
  await writeFile(path.join(root, "public", "data", "games-index.json"), JSON.stringify({ total: games.length, categories: counts }, null, 2) + "\n");
  console.log("games", games.length, "categories", Object.keys(counts).length);
}

async function vendorAndRewrite() {
  await fetchTo(
    "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js",
    path.join(root, "public", "vendor", "hls.min.js")
  );
  const from = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const to = "/vendor/hls.min.js";
  await walk(path.join(root, "public"), async (file) => {
    if (!file.endsWith(".html")) return;
    const text = await readFile(file, "utf8");
    if (!text.includes(from)) return;
    await writeFile(file, text.split(from).join(to));
    console.log("rewrote", path.relative(root, file));
  });
}

async function dropJunk() {
  const junk = [".grok", "artifacts", "screenshots", "attachments", ".vercel", "probe-game.mjs"];
  if (!onActions) {
    console.log("skip delete outside GitHub Actions:", junk.join(", "));
    return;
  }
  for (const name of junk) {
    const full = path.join(root, name);
    if (!existsSync(full)) continue;
    await rm(full, { recursive: true, force: true });
    console.log("removed", name);
  }
}

async function writeReadme() {
  const readme = `# goarxyz\n\nWatch, listen, and play. This tree is the site itself. Agent notes, screenshots, and build output are not part of it.\n\n## Layout\n\n| Path | What it is |\n| --- | --- |\n| \`public/\` | The site: home, movies, shows, music, games, live, anime, legal |\n| \`public/pages/watch\` | Movies and TV |\n| \`public/pages/music\` | Music |\n| \`public/pages/games\` | Games |\n| \`public/pages/live\` | Live TV |\n| \`public/pages/anime\` | Anime |\n| \`public/legal\` | Privacy, terms, copyright, contact |\n| \`public/vendor\` | Libraries fetched into the repo so pages do not depend on jsDelivr for playback |\n| \`public/data/games-index.json\` | Category counts for the game catalog |\n| \`server/\` | Same-origin proxy used by music, live, and games |\n\nContact: admin@goarxyz.com\n\n## Run\n\n\`\`\`\nnpm install\nnpm run dev\n\`\`\`\n\nOpen the home page. The GitHub Action \"Self-contained project\" vendors hls.js, sorts the game catalog, and removes workspace junk.\n`;
  await writeFile(path.join(root, "README.md"), readme);
}

async function ignoreJunk() {
  const file = path.join(root, ".gitignore");
  const extra = ["artifacts/", "screenshots/", "attachments/", ".grok/", ".vercel/", "probe-game.mjs"];
  let text = existsSync(file) ? await readFile(file, "utf8") : "";
  if (!text.endsWith("\n")) text += "\n";
  for (const line of extra) {
    if (!text.split("\n").includes(line)) text += line + "\n";
  }
  await writeFile(file, text);
}

const info = await stat(root);
if (!info.isDirectory()) throw new Error("no root");
await vendorAndRewrite();
await cleanGames();
await writeReadme();
await ignoreJunk();
await dropJunk();
console.log("self-contained tree ready");
