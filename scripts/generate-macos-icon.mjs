import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.resolve(__dirname, "../src-tauri/icons");
const inputPath = path.join(iconsDir, "icon.png");
const outputBasePath = path.join(iconsDir, "app-icon-generated.png");

const size = 1024;
// Lower = rounder corners. Tune to match app icon.
const superellipseExponent = 3.4;

const superellipsePath = (boxSize, inset = 0, exponent = superellipseExponent) => {
  const a = (boxSize / 2) - inset;
  const b = (boxSize / 2) - inset;
  const cx = boxSize / 2;
  const cy = boxSize / 2;
  const steps = 256;

  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = cx + Math.sign(cos) * a * Math.pow(Math.abs(cos), 2 / exponent);
    const y = cy + Math.sign(sin) * b * Math.pow(Math.abs(sin), 2 / exponent);
    points.push([x, y]);
  }

  const [startX, startY] = points[0];
  const commands = [`M ${startX} ${startY}`];
  for (const [x, y] of points.slice(1)) {
    commands.push(`L ${x} ${y}`);
  }
  commands.push("Z");
  return commands.join(" ");
};

const makeRoundedMask = () => {
  const path = superellipsePath(size, 0);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="white"/>
    </svg>`
  );
};

const makeGlossOverlay = () => {
  const path = superellipsePath(size, 0);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
          <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.15"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${path}" fill="url(#gloss)"/>
    </svg>`
  );
};

const makeBorder = () => {
  const path = superellipsePath(size, 1.5);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2"/>
    </svg>`
  );
};

const makeShadow = () => {
  const path = superellipsePath(size, 8);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <path d="${path}" fill="rgba(0,0,0,0.35)"/>
    </svg>`
  );
};

const iconsetSizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 },
];

const tauriSizes = [
  { name: "32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },
];

const main = async () => {
  if (!existsSync(inputPath)) {
    console.error(`Missing input icon at ${inputPath}`);
    process.exit(1);
  }

  const base = sharp(inputPath)
    .resize(size, size, { fit: "cover" })
    .png();

  const rounded = await base
    .composite([{ input: makeRoundedMask(), blend: "dest-in" }])
    .toBuffer();

  const shadow = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: makeShadow() }])
    .blur(18)
    .png()
    .toBuffer();

  const polished = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadow },
      { input: rounded },
      { input: makeGlossOverlay() },
      { input: makeBorder() },
    ])
    .png()
    .toBuffer();

  const polishedMasked = await sharp(polished)
    .composite([{ input: makeRoundedMask(), blend: "dest-in" }])
    .png()
    .toBuffer();

  await fs.writeFile(outputBasePath, polishedMasked);
  await fs.writeFile(path.join(iconsDir, "icon.png"), polishedMasked);
  await fs.writeFile(path.join(iconsDir, "app-icon.png"), polishedMasked);

  for (const target of tauriSizes) {
    const outPath = path.join(iconsDir, target.name);
    await sharp(polishedMasked).resize(target.size, target.size).png().toFile(outPath);
  }

  const iconsetDir = path.join(iconsDir, "app-icon-generated.iconset");
  await fs.rm(iconsetDir, { recursive: true, force: true });
  await fs.mkdir(iconsetDir, { recursive: true });

  for (const target of iconsetSizes) {
    const outPath = path.join(iconsetDir, target.name);
    await sharp(polishedMasked).resize(target.size, target.size).png().toFile(outPath);
  }

  const icnsPath = path.join(iconsDir, "icon.icns");
  const iconutil = spawnSync("iconutil", ["-c", "icns", iconsetDir, "-o", icnsPath], {
    stdio: "inherit",
  });

  if (iconutil.status !== 0) {
    console.error("Failed to generate icon.icns. Ensure iconutil is available on macOS.");
    process.exit(1);
  }

  await fs.rm(iconsetDir, { recursive: true, force: true });

  console.log("Generated polished macOS icon:");
  console.log(`- ${outputBasePath}`);
  console.log(`- ${path.join(iconsDir, "32x32.png")}`);
  console.log(`- ${path.join(iconsDir, "128x128.png")}`);
  console.log(`- ${path.join(iconsDir, "128x128@2x.png")}`);
  console.log(`- ${icnsPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
