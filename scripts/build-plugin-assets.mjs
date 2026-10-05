#!/usr/bin/env node
/**
 * Regenerates the portable plugin's brand assets from the shared brand mark.
 *
 * The mark is the lucide "cat" glyph the companion iOS app renders via
 * `CatLogo` (`next-ios/What2REG@UM/Assets.xcassets/CatLogo.imageset/cat-blue.svg`,
 * stroke `#003DB8`). It is kept here as `design/cat-logo.svg` with its ISC
 * license header intact, so this repository can rebuild the PNGs on its own.
 *
 * The glyph is vector (24x24 viewBox), so rasterising at 512x512 is lossless and
 * never upscales a low-resolution bitmap (as `public/whole-icon.png`, now
 * retired, would have been).
 *
 * `sharp` ships as an optional dependency of Next.js; it is already present
 * after `npm install`. This is a maintainer script and is not part of the
 * deployed application.
 *
 * Usage: node scripts/build-plugin-assets.mjs
 */
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const SIZE = 512;
const root = process.cwd();
const sourcePath = path.join(root, "design/cat-logo.svg");
const outputDir = path.join(root, "plugins/what2reg-um/assets");

const svg = await readFile(sourcePath);
await mkdir(outputDir, { recursive: true });

const rendered = await sharp(svg, { density: 1536 })
  .resize(SIZE, SIZE, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

for (const filename of ["logo.png", "composer-icon.png"]) {
  await sharp(rendered).toFile(path.join(outputDir, filename));
}

const { channels, hasAlpha } = await sharp(rendered).metadata();
console.log(
  `wrote ${SIZE}x${SIZE} ${channels}-channel PNGs (alpha=${Boolean(hasAlpha)}) to ${path.relative(root, outputDir)}`,
);
