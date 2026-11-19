#!/usr/bin/env node
// figma-token-export
// Mengubah JSON hasil plugin Figma "Token Export" → file CSS variables.
//
// Pakai:
//   npx figma-token-export
//   npx figma-token-export --input tokens/figma-variables.json --output tokens/tokens.css
//
// Aturan penamaan: nama koleksi dibuang, path digabung pakai "-"
//   Primitives / ink/1            → --ink-1
//   Semantic   / surface/ground   → --surface-ground   (alias → var(--ink-2))
//   Shape & Size / radius/control → --radius-control   (angka → px)
//   Typography / text/display     → --type-display (shorthand untuk `font:`),
//                                   --type-display-size, -line-height, -weight

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

if (args.includes("--help") || args.includes("-h")) {
  console.log(`figma-token-export

  --input  <file>   JSON dari plugin Figma   (default: tokens/figma-variables.json)
  --output <file>   File CSS hasil generate  (default: tokens/tokens.css)
  --title  <text>   Judul di header CSS      (default: "Design Tokens")`);
  process.exit(0);
}

const input = resolve(process.cwd(), opt("--input", "tokens/figma-variables.json"));
const output = resolve(process.cwd(), opt("--output", "tokens/tokens.css"));
const title = opt("--title", "Design Tokens");

if (!existsSync(input)) {
  console.error(`✗ File tidak ditemukan: ${input}
  Ekspor dulu dari plugin Figma "Token Export", lalu simpan di path itu,
  atau tentukan lokasinya dengan --input <file>.`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(input, "utf8"));

const kebab = (s) => String(s).trim().toLowerCase().replace(/[\s_/&]+/g, "-");
const isToken = (node) => node && typeof node === "object" && "$value" in node;

// "{Primitives.ink.2}" → "var(--ink-2)"
function resolveValue(token) {
  const v = token.$value;
  if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
    const path = v.slice(1, -1).split(".").slice(1); // buang nama koleksi
    return `var(--${path.map(kebab).join("-")})`;
  }
  if (token.$type === "number" && typeof v === "number") return `${v}px`;
  return v;
}

// Telusuri objek, kumpulkan [nama, token] per grup level pertama
function collect(node, path, groups) {
  for (const [key, child] of Object.entries(node)) {
    const next = [...path, key];
    if (isToken(child)) {
      const group = next[0];
      (groups[group] ||= []).push([next.map(kebab).join("-"), child]);
    } else if (child && typeof child === "object") {
      collect(child, next, groups);
    }
  }
}

const lines = [];
const push = (s = "") => lines.push(s);

push("/* ==========================================================================");
push(`   ${title}`);
push("   ⚠️  FILE INI DI-GENERATE. Jangan edit manual.");
push(`   Sumber : ${opt("--input", "tokens/figma-variables.json")} (plugin Figma "Token Export")`);
push("   Update : npx figma-token-export");
push("   ========================================================================== */");
push();
push(":root {");

let fontFamily = null;

for (const [collection, tree] of Object.entries(data)) {
  if (collection === "Typography") continue;
  const groups = {};
  collect(tree, [], groups);
  for (const [group, tokens] of Object.entries(groups)) {
    push(`  /* ---------- ${collection}: ${group} ---------- */`);
    for (const [name, token] of tokens) push(`  --${name}: ${resolveValue(token)};`);
    push();
  }
}

if (data.Typography) {
  const groups = {};
  collect(data.Typography, [], groups);
  push("  /* ---------- Typography (dari text styles Figma) ---------- */");
  for (const tokens of Object.values(groups)) {
    for (const [rawName, token] of tokens) {
      // Prefix "type-" supaya tidak bentrok dengan token warna (mis. --text-meta).
      // "text-body" → "type-body"
      const name = "type-" + rawName.replace(/^(text|type|typography)-/, "");
      const t = token.$value;
      fontFamily ||= t.fontFamily;
      // Shorthand siap pakai: font: var(--text-body);
      push(`  --${name}: ${t.fontWeight} ${t.fontSize}px/${t.lineHeight} var(--font-sans);`);
      push(`  --${name}-size: ${t.fontSize}px;`);
      push(`  --${name}-line-height: ${t.lineHeight};`);
      push(`  --${name}-weight: ${t.fontWeight};`);
      if (t.letterSpacing) push(`  --${name}-letter-spacing: ${t.letterSpacing}px;`);
    }
  }
  push();
}

push("  /* ---------- Font ---------- */");
push(`  --font-sans: "${fontFamily || "Roboto"}", system-ui, -apple-system, "Segoe UI", sans-serif;`);
push("  --weight-regular: 400;");
push("  --weight-bold: 700;");
push("}");

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n") + "\n");

const count = lines.filter((l) => l.trim().startsWith("--")).length;
console.log(`✓ ${opt("--output", "tokens/tokens.css")} dibuat — ${count} CSS variables`);
