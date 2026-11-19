// Token Export — https://github.com/refiepratama-dev/figma-token-export
// Membaca semua local variables + text styles di file Figma yang sedang dibuka,
// lalu mengubahnya jadi JSON (format mirip W3C Design Tokens / DTCG).
//
// Simpan hasilnya di project sebagai tokens/figma-variables.json,
// lalu jalankan CLI `figma-token-export` untuk membuat tokens/tokens.css.

figma.showUI(__html__, { width: 480, height: 520 });

function toHex(c) {
  const ch = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  const hex = "#" + ch(c.r) + ch(c.g) + ch(c.b);
  return c.a !== undefined && c.a < 1 ? hex + ch(c.a) : hex;
}

// Taruh nilai di objek bertingkat sesuai path "ink/1" → { ink: { 1: ... } }
function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    cur[path[i]] = cur[path[i]] || {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
}

const WEIGHTS = {
  thin: 100, extralight: 200, light: 300, regular: 400, medium: 500,
  semibold: 600, bold: 700, extrabold: 800, black: 900
};

async function exportTokens() {
  const out = {};
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  // Peta id → "Koleksi.path.ke.token", untuk menulis alias
  const refById = {};
  for (const col of collections) {
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      refById[id] = [col.name].concat(v.name.split("/")).join(".");
    }
  }

  for (const col of collections) {
    const modeId = col.defaultModeId;
    out[col.name] = {};
    for (const id of col.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      const raw = v.valuesByMode[modeId];
      let value;
      let type;

      if (raw && raw.type === "VARIABLE_ALIAS") {
        value = "{" + (refById[raw.id] || "unknown") + "}";
        type = v.resolvedType === "COLOR" ? "color" : "number";
      } else if (v.resolvedType === "COLOR") {
        value = toHex(raw);
        type = "color";
      } else if (v.resolvedType === "FLOAT") {
        value = raw;
        type = "number";
      } else {
        value = raw;
        type = "string";
      }

      setPath(out[col.name], v.name.split("/"), { $type: type, $value: value });
    }
  }

  // Text styles → koleksi "Typography"
  const textStyles = await figma.getLocalTextStylesAsync();
  if (textStyles.length) {
    out.Typography = {};
    for (const s of textStyles) {
      const styleKey = s.fontName.style.toLowerCase().replace(/[\s-]/g, "");
      let lineHeight = "normal";
      if (s.lineHeight.unit === "PIXELS") lineHeight = s.lineHeight.value + "px";
      if (s.lineHeight.unit === "PERCENT") lineHeight = +(s.lineHeight.value / 100).toFixed(3);

      setPath(out.Typography, s.name.split("/"), {
        $type: "typography",
        $value: {
          fontFamily: s.fontName.family,
          fontWeight: WEIGHTS[styleKey] || 400,
          fontSize: s.fontSize,
          lineHeight: lineHeight,
          letterSpacing: s.letterSpacing.unit === "PIXELS"
            ? s.letterSpacing.value
            : +(s.letterSpacing.value / 100 * s.fontSize).toFixed(3)
        }
      });
    }
  }

  return out;
}

exportTokens()
  .then((tokens) => figma.ui.postMessage({ type: "tokens", json: JSON.stringify(tokens, null, 2) }))
  .catch((err) => figma.ui.postMessage({ type: "error", message: String(err) }));

figma.ui.onmessage = (msg) => {
  if (msg.type === "close") figma.closePlugin();
  if (msg.type === "notify") figma.notify(msg.text);
};
