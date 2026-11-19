# figma-token-export

Alat kecil untuk menjadikan **Figma variables dan text styles** sebagai **CSS variables**, tanpa plugin berbayar dan tanpa Figma Enterprise.

```
Figma (variables + text styles)
   │  plugin "Token Export"
   ▼
tokens/figma-variables.json
   │  npx figma-token-export
   ▼
tokens/tokens.css
```

## 1. Pasang plugin Figma (sekali saja)

1. Clone repo ini.
2. Di **Figma Desktop**, buka Plugins → Development → **Import plugin from manifest…**
3. Pilih `plugin/manifest.json`.

Plugin ini bisa dipakai di file Figma mana pun dan selalu membaca file yang sedang dibuka.

## 2. Ekspor dari Figma

Di file Figma project kamu, jalankan Plugins → Development → **Token Export**, lalu klik **Download JSON**. Simpan file itu di project sebagai `tokens/figma-variables.json`.

## 3. Generate CSS

**Opsi A, langsung tanpa install:**

```bash
npx github:refiepratama-dev/figma-token-export
```

**Opsi B, sebagai devDependency (disarankan untuk project tim):**

```bash
npm install -D github:refiepratama-dev/figma-token-export
```

Lalu tambahkan script ini di `package.json` project:

```json
"scripts": {
  "tokens": "figma-token-export --title \"Nama Project — Tokens\""
}
```

Setelah itu cukup jalankan `npm run tokens`.

### Opsi CLI

| Opsi | Default | Keterangan |
|---|---|---|
| `--input` | `tokens/figma-variables.json` | JSON hasil plugin |
| `--output` | `tokens/tokens.css` | File CSS hasil generate |
| `--title` | `Design Tokens` | Judul di header CSS |

## Aturan penamaan

| Figma | CSS |
|---|---|
| `Primitives / ink/1` = `#fafaf9` | `--ink-1: #fafaf9;` |
| `Semantic / surface/ground` → alias `ink/2` | `--surface-ground: var(--ink-2);` |
| `Shape & Size / radius/control` = `6` | `--radius-control: 6px;` |
| Text style `text/body` (Roboto 13/20) | `--type-body: 400 13px/20px var(--font-sans);` dan `--type-body-size`, `--type-body-line-height`, `--type-body-weight` |

- Nama koleksi tidak ikut ke nama variable. Jadi pastikan nama variable unik di semua koleksi.
- Text style memakai prefix `--type-` supaya tidak bentrok dengan token warna seperti `--text-meta`.
- Kalau variable punya beberapa mode (misalnya Light/Dark), yang diekspor hanya **mode default**.

## Lisensi

MIT
