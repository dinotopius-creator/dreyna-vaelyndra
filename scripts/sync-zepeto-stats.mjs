#!/usr/bin/env node
/**
 * Récupère les stats publiques du profil ZEPETO de Dreyna et les écrit
 * dans src/data/zepeto-stats.json. Destiné à être lancé par un cron GitHub
 * Actions, mais peut être exécuté localement : `node scripts/sync-zepeto-stats.mjs`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_URL =
  "https://web.zepeto.me/share/user/profile/dreynakame";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.resolve(__dirname, "..", "src", "data", "zepeto-stats.json");

function parseCount(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/\s+/g, "").replace(",", ".");
  const m = s.match(/^([\d.]+)\s*([KkMm]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  if (unit === "k") return Math.round(n * 1_000);
  if (unit === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

function extractStat(html, label) {
  // ZEPETO rend le bloc stats comme suit :
  //   <strong ...>5.9K</strong></span>
  //   <span ...ItemLabel...>Follower</span>
  // On repère la position du label, puis on remonte au <strong> le plus
  // proche avant ce label.
  const labelRe = new RegExp(`>\\s*${label}\\s*<`, "i");
  const labelMatch = html.match(labelRe);
  if (!labelMatch || labelMatch.index == null) return null;
  const before = html.slice(Math.max(0, labelMatch.index - 600), labelMatch.index);
  const strongRe = /<strong[^>]*>\s*([\d.,KkMm]+)\s*<\/strong>/gi;
  let last = null;
  let m;
  while ((m = strongRe.exec(before)) !== null) last = m;
  return last ? parseCount(last[1]) : null;
}

async function main() {
  console.log(`↻ Sync ZEPETO stats depuis ${PROFILE_URL}`);
  const res = await fetch(PROFILE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  const html = await res.text();

  const followers = extractStat(html, "Follower");
  const following = extractStat(html, "Following");
  const posts = extractStat(html, "Post");

  if (followers == null) {
    throw new Error(
      "Impossible de parser le nombre d'abonnés (structure de page changée ?).",
    );
  }

  const data = {
    source: PROFILE_URL,
    handle: "dreynakame",
    followers,
    following,
    posts,
    fetchedAt: new Date().toISOString(),
  };

  console.log("✓ Stats récupérées :", data);

  let previous = null;
  try {
    const prev = await fs.readFile(OUTPUT, "utf8");
    previous = JSON.parse(prev);
  } catch {
    // fichier absent, première exécution
  }

  if (
    previous &&
    previous.followers === data.followers &&
    previous.following === data.following &&
    previous.posts === data.posts
  ) {
    // rien à changer, on met juste à jour fetchedAt pour montrer la dernière tentative
    console.log("= Aucun changement, fichier laissé tel quel.");
    return;
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
  await fs.writeFile(OUTPUT, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(`✎ Écrit ${OUTPUT}`);
}

main().catch((err) => {
  console.error("✗", err);
  process.exit(1);
});
