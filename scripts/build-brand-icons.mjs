#!/usr/bin/env node
/**
 * Regenerates the browser/app icons from the shared brand mark.
 *
 * The mark is the same lucide "cat" glyph the companion iOS app renders via
 * `CatLogo` (`next-ios/What2REG@UM/Assets.xcassets/CatLogo.imageset/cat-blue.svg`,
 * stroke `#003DB8`). This repository keeps the licensed ISC source at
 * `design/cat-logo.svg`, and this script reads the path geometry straight from
 * it, so the web icons can never drift from the iOS mark. `sharp` ships as an
 * optional dependency of Next.js and is already present after `npm install`.
 * This is a maintainer script; it is not part of the deployed application.
 *
 * Geometry copied from the iOS `AppIcon.appiconset` (measured on the 1024×1024
 * masters):
 *   - light 1024: background #FFFFFF, glyph #003DB8
 *   - dark  1024: background #0C2046, glyph #FFFFFF
 *   - both place the glyph ink on 56.2% of the canvas (bbox 225…799 of 1024),
 *     so `apple-touch-icon.png` reuses that inset and the iOS home-screen icon
 *     and the native app icon line up.
 *
 * Outputs (all in `public/`, served from the site root):
 *   - favicon.ico                        16/32/48 BMP-in-ICO entries
 *   - favicon.svg                        light mark, for `rel="icon"`
 *   - favicon-dark.svg                   dark mark, for `prefers-color-scheme: dark`
 *   - apple-touch-icon.png               180×180, opaque, iOS masks the corners
 *   - apple-touch-icon-precomposed.png   byte-identical legacy twin
 *   - icon/192.png, icon/512.png         `purpose: "any"` manifest icons
 *   - icon/maskable-512.png              `purpose: "maskable"` manifest icon
 *
 * The manifest PNGs replace the retired `public/icon/*.jpg` set (72…512 JPEG
 * rasters on a flat light background); `app/manifest.ts` points at them.
 *
 * The two `apple-touch-icon*` files use a full-bleed square: iOS applies its own
 * squircle mask, so baking a radius (or transparency) into the PNG would show up
 * as rounded corners inside a rounded corner. The browser favicons do get a
 * radius because nothing masks them in a tab strip, and so do the `any` manifest
 * icons; the `maskable` one is full-bleed with its own smaller inset so that
 * whatever shape Android crops to keeps the whole glyph and background intact.
 *
 * Tab-strip marks are cropped tighter than the iOS icon: they map the glyph
 * viewBox onto the whole canvas, i.e. lucide's own ~8% padding and an 83.4% ink
 * fraction — exactly the framing of the existing transparent web brand assets
 * (`plugins/what2reg-um/assets/logo.png`; the 24×24 `public/favicon.png` raster
 * is retired). Keeping the iOS inset instead would leave a ~9px cat in a 16px
 * tab, which is not legible.
 *
 * Usage: node scripts/build-brand-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const GLYPH_VIEWBOX = 24;
/** Ink extent of the lucide cat inside its 24-unit viewBox, measured. */
const GLYPH_INK_UNITS = 20.016;

/** Glyph viewBox edge as a fraction of the canvas, per mark. */
const FAVICON_GLYPH_SCALE = 1;
/** iOS AppIcon: glyph ink on 56.2% of the canvas. */
const APPLE_TOUCH_GLYPH_SCALE = (0.562 * GLYPH_VIEWBOX) / GLYPH_INK_UNITS;
/**
 * Maskable icons are cropped to a circle of 80% diameter, i.e. a safe radius of
 * 40% of the edge. A 50% ink fraction puts the glyph's farthest corner at ~35%,
 * which keeps the whole cat inside whatever shape Android masks to.
 */
const MASKABLE_GLYPH_SCALE = (0.5 * GLYPH_VIEWBOX) / GLYPH_INK_UNITS;

/** iOS squircle corner radius as a fraction of the icon edge. */
const CORNER_RATIO = 0.2237;

/** `public/` marks, mirroring the iOS AppIcon light/dark pair. */
const LIGHT = { background: "#FFFFFF", foreground: "#003DB8" };
const DARK = { background: "#0C2046", foreground: "#FFFFFF" };

/** Edge lengths of the BMP entries packed into `favicon.ico`. */
const ICO_SIZES = [16, 32, 48];

const APPLE_TOUCH_ICON_SIZE = 180;

/**
 * Web app manifest icons, mirroring the entries in `app/manifest.ts`.
 * `any` marks keep the tab-strip framing; the maskable one is a full-bleed tile
 * with `MASKABLE_GLYPH_SCALE` so it stays inside Android's 80% safe circle.
 */
const MANIFEST_ICONS = [
  { file: "icon/192.png", size: 192 },
  { file: "icon/512.png", size: 512 },
  {
    file: "icon/maskable-512.png",
    size: 512,
    glyphScale: MASKABLE_GLYPH_SCALE,
    radiusRatio: 0,
  },
];

const root = process.cwd();
const sourcePath = path.join(root, "design", "cat-logo.svg");
const publicDir = path.join(root, "public");

const source = await readFile(sourcePath, "utf8");

const strokeMatch = source.match(/stroke="(#[0-9A-Fa-f]{6})"/);
if (!strokeMatch) {
  throw new Error(`${path.relative(root, sourcePath)} must declare a stroke colour`);
}
if (strokeMatch[1].toUpperCase() !== LIGHT.foreground) {
  throw new Error(
    `brand drift: ${path.relative(root, sourcePath)} uses ${strokeMatch[1]}, ` +
      `expected ${LIGHT.foreground} (the iOS CatLogo stroke)`,
  );
}

const glyphPaths = [...source.matchAll(/<path\s+d="([^"]+)"\s*\/>/g)].map((m) => m[1]);
if (glyphPaths.length === 0) {
  throw new Error(`no <path d="…"/> geometry found in ${path.relative(root, sourcePath)}`);
}

const GLYPH_ATTRIBUTES = [
  'fill="none"',
  'stroke-width="2"',
  'stroke-linecap="round"',
  'stroke-linejoin="round"',
].join(" ");

/**
 * The brand mark as an SVG document.
 *
 * `renderSize` is the edge length the vector is laid out at; callers rasterise
 * larger than the final icon and downsample.
 */
function markSvg({ renderSize, background, foreground, radiusRatio = 0, glyphScale = FAVICON_GLYPH_SCALE }) {
  const glyphEdge = renderSize * glyphScale;
  const offset = (renderSize - glyphEdge) / 2;
  const radius = renderSize * radiusRatio;
  const scale = glyphEdge / GLYPH_VIEWBOX;
  const transform = [
    offset === 0 ? null : `translate(${round(offset)} ${round(offset)})`,
    scale === 1 ? null : `scale(${round(scale, 6)})`,
  ]
    .filter(Boolean)
    .join(" ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderSize}" height="${renderSize}" viewBox="0 0 ${renderSize} ${renderSize}">
  <rect width="${renderSize}" height="${renderSize}" rx="${round(radius)}" fill="${background}"/>
  <g${transform ? ` transform="${transform}"` : ""} stroke="${foreground}" ${GLYPH_ATTRIBUTES}>
${glyphPaths.map((d) => `    <path d="${d}"/>`).join("\n")}
  </g>
</svg>
`;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Rasterises a mark at `size`, supersampling and downsampling for clean edges. */
async function renderRgba(mark, size, supersample = 8) {
  return sharp(Buffer.from(markSvg({ ...mark, renderSize: size * supersample })), {
    density: 72,
  })
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function renderPng(mark, size, supersample = 8) {
  return sharp(Buffer.from(markSvg({ ...mark, renderSize: size * supersample })))
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * A 32bpp BMP icon entry: `BITMAPINFOHEADER`, bottom-up BGRA pixels, then the
 * 1bpp AND mask (bit set = transparent, rows padded to 4 bytes).
 */
function bmpEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR bitmap + AND mask
  header.writeUInt16LE(1, 12); // planes
  header.writeUInt16LE(32, 14); // bits per pixel
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(size * size * 4, 20);

  const pixels = Buffer.alloc(size * size * 4);
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size);

  for (let y = 0; y < size; y += 1) {
    const sourceRow = size - 1 - y; // BMP rows run bottom-up
    for (let x = 0; x < size; x += 1) {
      const from = (sourceRow * size + x) * 4;
      const to = (y * size + x) * 4;
      pixels[to] = rgba[from + 2];
      pixels[to + 1] = rgba[from + 1];
      pixels[to + 2] = rgba[from];
      pixels[to + 3] = rgba[from + 3];
      if (rgba[from + 3] < 128) {
        mask[y * maskRowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, pixels, mask]);
}

/** Wraps icon entries into an ICO container (type 1). */
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(16 * entries.length);
  let offset = header.length + directory.length;
  entries.forEach(({ size, payload }, index) => {
    const at = index * 16;
    directory[at] = size >= 256 ? 0 : size;
    directory[at + 1] = size >= 256 ? 0 : size;
    directory[at + 2] = 0; // palette size
    directory[at + 3] = 0; // reserved
    directory.writeUInt16LE(1, at + 4); // planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(payload.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += payload.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.payload)]);
}

const LICENSE_HEADER = `<!-- Generated by scripts/build-brand-icons.mjs — do not edit by hand.
     Brand mark: lucide "cat" (lucide-static v1.31.0, ISC), the same glyph as the
     iOS app's CatLogo. Geometry source: design/cat-logo.svg. -->`;

await mkdir(publicDir, { recursive: true });

// Vector favicons: the light mark is the default, the dark mark is picked up by
// `media="(prefers-color-scheme: dark)"` in app/layout.tsx.
await writeFile(
  path.join(publicDir, "favicon.svg"),
  `${LICENSE_HEADER}\n${markSvg({ ...LIGHT, renderSize: 32, radiusRatio: CORNER_RATIO })}`,
);
await writeFile(
  path.join(publicDir, "favicon-dark.svg"),
  `${LICENSE_HEADER}\n${markSvg({ ...DARK, renderSize: 32, radiusRatio: CORNER_RATIO })}`,
);

// favicon.ico: legacy `/favicon.ico` request plus the raster fallback for
// browsers that ignore the SVG link.
const icoEntries = [];
for (const size of ICO_SIZES) {
  const rgba = await renderRgba({ ...LIGHT, radiusRatio: CORNER_RATIO }, size);
  icoEntries.push({ size, payload: bmpEntry(rgba, size) });
}
const ico = encodeIco(icoEntries);
await writeFile(path.join(publicDir, "favicon.ico"), ico);

// apple-touch-icon: full-bleed opaque square at the iOS glyph inset; iOS
// supplies the mask, and transparency would otherwise composite on black.
const appleTouchIcon = await renderPng(
  { ...LIGHT, radiusRatio: 0, glyphScale: APPLE_TOUCH_GLYPH_SCALE },
  APPLE_TOUCH_ICON_SIZE,
);
await writeFile(path.join(publicDir, "apple-touch-icon.png"), appleTouchIcon);
await writeFile(
  path.join(publicDir, "apple-touch-icon-precomposed.png"),
  appleTouchIcon,
);

// Web app manifest icons (Android install + splash). Same light mark; the
// maskable entry is unrounded so Android's mask never bites into the tile.
for (const { file, size, glyphScale = FAVICON_GLYPH_SCALE, radiusRatio = CORNER_RATIO } of MANIFEST_ICONS) {
  const png = await renderPng({ ...LIGHT, glyphScale, radiusRatio }, size);
  const target = path.join(publicDir, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, png);
}

const relative = (file) => path.relative(root, file);
console.log(
  [
    `wrote ${relative(path.join(publicDir, "favicon.svg"))} and favicon-dark.svg (vector)`,
    `wrote ${relative(path.join(publicDir, "favicon.ico"))} — ${ICO_SIZES.map((s) => `${s}x${s}`).join("/")} BMP entries, ${ico.byteLength} bytes`,
    `wrote ${relative(path.join(publicDir, "apple-touch-icon.png"))} and apple-touch-icon-precomposed.png — ${APPLE_TOUCH_ICON_SIZE}x${APPLE_TOUCH_ICON_SIZE}, ${appleTouchIcon.byteLength} bytes each`,
    `wrote ${MANIFEST_ICONS.map((icon) => `${icon.file} (${icon.size}x${icon.size})`).join(", ")}`,
  ].join("\n"),
);
