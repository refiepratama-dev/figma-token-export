#!/usr/bin/env node
// figma-token-export
// Mengubah JSON hasil plugin Figma "Token Export" → file CSS variables.
//
// Pakai:
//   npx figma-token-export
//   npx figma-token-export --input tokens/figma-variables.json --output tokens/tokens.css
//   npx figma-token-export --format csharp --namespace App.Theme --class BrandTokens --output Theme/BrandTokens.g.cs
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

  --format    css | csharp   Format output              (default: css)
  --input     <file>         JSON dari plugin Figma     (default: tokens/figma-variables.json)
  --output    <file>         File hasil generate        (default: tokens/tokens.css atau tokens/Tokens.g.cs)
  --title     <text>         Judul di header file       (default: "Design Tokens")
  --namespace <name>         Namespace C#               (default: DesignTokens)
  --class     <name>         Nama class C#              (default: Tokens)`);
  process.exit(0);
}

const format = opt("--format", "css").toLowerCase();
if (!["css", "csharp"].includes(format)) {
  console.error(`✗ --format tidak dikenal: ${format} (pilih: css, csharp)`);
  process.exit(1);
}
const inputArg = opt("--input", "tokens/figma-variables.json");
const outputArg = opt("--output", format === "csharp" ? "tokens/Tokens.g.cs" : "tokens/tokens.css");
const input = resolve(process.cwd(), inputArg);
const output = resolve(process.cwd(), outputArg);
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

function buildCss() {
  const lines = [];
  const push = (s = "") => lines.push(s);

  push("/* ==========================================================================");
  push(`   ${title}`);
  push("   ⚠️  FILE INI DI-GENERATE. Jangan edit manual.");
  push(`   Sumber : ${inputArg} (plugin Figma "Token Export")`);
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
  return lines;
}

// ---------------------------------------------------------------------------
// C#: konstanta statis, cocok untuk tema MudBlazor / .NET
// ---------------------------------------------------------------------------
const pascal = (parts) =>
  parts
    .flatMap((p) => String(p).split(/[\s_/&-]+/))
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

const csString = (v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const csNumber = (n) => (Number.isInteger(n) ? { type: "int", lit: String(n) } : { type: "double", lit: String(n) });

function buildCsharp() {
  const ns = opt("--namespace", "DesignTokens");
  const cls = opt("--class", "Tokens");

  // Kumpulkan semua token non-typography: nama C# + koleksi + nilai
  const colors = [];
  const sizes = [];
  const nameByRef = {}; // "Primitives.ink.2" → "Ink2"
  const seen = new Set();

  function walk(node, collection, path) {
    for (const [key, child] of Object.entries(node)) {
      const next = [...path, key];
      if (isToken(child)) {
        let name = pascal(next);
        if (/^\d/.test(name)) name = "_" + name;
        if (seen.has(name)) name = pascal([collection, ...next]); // hindari bentrok
        seen.add(name);
        nameByRef[[collection, ...next].join(".")] = name;
        const entry = { name, collection, path: next.join("/"), token: child };
        (child.$type === "color" ? colors : sizes).push(entry);
      } else if (child && typeof child === "object") {
        walk(child, collection, next);
      }
    }
  }
  for (const [collection, tree] of Object.entries(data)) {
    if (collection !== "Typography") walk(tree, collection, []);
  }

  const valueOf = (entry) => {
    const v = entry.token.$value;
    if (typeof v === "string" && v.startsWith("{") && v.endsWith("}")) {
      const ref = nameByRef[v.slice(1, -1)];
      return { alias: ref, type: entry.token.$type === "color" ? "string" : null };
    }
    if (entry.token.$type === "color") return { type: "string", lit: csString(v) };
    if (typeof v === "number") return csNumber(v);
    return { type: "string", lit: csString(v) };
  };

  const L = [];
  const p = (s = "") => L.push(s);
  p("// <auto-generated>");
  p(`//   ${title}`);
  p("//   FILE INI DI-GENERATE oleh figma-token-export. Jangan edit manual.");
  p(`//   Sumber : ${inputArg} (plugin Figma "Token Export")`);
  p(`//   Update : npx figma-token-export --format csharp`);
  p("// </auto-generated>");
  p();
  p(`namespace ${ns};`);
  p();
  p(`/// <summary>${title}. Nilai dari Figma variables dan text styles.</summary>`);
  p(`public static class ${cls}`);
  p("{");

  // Colors
  p("    /// <summary>Warna (hex). Alias Figma ditulis sebagai referensi ke konstanta lain.</summary>");
  p("    public static class Colors");
  p("    {");
  let lastColl = null;
  for (const e of colors) {
    if (e.collection !== lastColl) {
      if (lastColl) p();
      p(`        // ${e.collection}`);
      lastColl = e.collection;
    }
    const v = valueOf(e);
    p(`        public const string ${e.name} = ${v.alias ?? v.lit}; // ${e.path}`);
  }
  p("    }");
  p();

  // Sizes (angka): tipe ditentukan dari nilai akhir
  const resolvedType = (e, depth = 0) => {
    const v = valueOf(e);
    if (!v.alias) return v.type;
    const target = sizes.find((x) => x.name === v.alias);
    return target && depth < 10 ? resolvedType(target, depth + 1) : "double";
  };
  p("    /// <summary>Ukuran dalam px (radius, spasi, tinggi, dll.).</summary>");
  p("    public static class Sizes");
  p("    {");
  lastColl = null;
  for (const e of sizes) {
    if (e.collection !== lastColl) {
      if (lastColl) p();
      p(`        // ${e.collection}`);
      lastColl = e.collection;
    }
    const v = valueOf(e);
    p(`        public const ${resolvedType(e)} ${e.name} = ${v.alias ?? v.lit}; // ${e.path}`);
  }
  p("    }");

  // Typography
  if (data.Typography) {
    const styles = [];
    (function walkT(node, path) {
      for (const [key, child] of Object.entries(node)) {
        const next = [...path, key];
        if (isToken(child)) styles.push({ path: next, t: child.$value });
        else if (child && typeof child === "object") walkT(child, next);
      }
    })(data.Typography, []);

    p();
    p("    /// <summary>Text styles Figma. LineHeight berupa string CSS (mis. \"20px\").</summary>");
    p("    public static class Typography");
    p("    {");
    p(`        public const string FontFamily = ${csString(styles[0]?.t.fontFamily ?? "Roboto")};`);
    for (const s of styles) {
      const parts = s.path[0].match(/^(text|type|typography)$/i) ? s.path.slice(1) : s.path;
      const name = pascal(parts);
      const lh = typeof s.t.lineHeight === "number" ? String(s.t.lineHeight) : s.t.lineHeight;
      p();
      p(`        public static class ${name} // ${s.path.join("/")}`);
      p("        {");
      p(`            public const int FontSize = ${s.t.fontSize};`);
      p(`            public const int FontWeight = ${s.t.fontWeight};`);
      p(`            public const string LineHeight = ${csString(lh)};`);
      p(`            public const double LetterSpacing = ${s.t.letterSpacing || 0};`);
      p("        }");
    }
    p("    }");
  }

  p("}");
  return { lines: L, count: colors.length + sizes.length };
}

mkdirSync(dirname(output), { recursive: true });

if (format === "csharp") {
  const { lines, count } = buildCsharp();
  writeFileSync(output, lines.join("\n") + "\n");
  console.log(`✓ ${outputArg} dibuat — ${count} konstanta C#`);
} else {
  const lines = buildCss();
  writeFileSync(output, lines.join("\n") + "\n");
  const count = lines.filter((l) => l.trim().startsWith("--")).length;
  console.log(`✓ ${outputArg} dibuat — ${count} CSS variables`);
}
