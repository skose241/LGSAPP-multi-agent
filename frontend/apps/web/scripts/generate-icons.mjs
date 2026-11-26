import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "scripts", "icons");
const outDir = path.join(root, "public", "icons");

const targets = [
  { source: "icon-any.svg", size: 192, file: "icon-192.png" },
  { source: "icon-any.svg", size: 512, file: "icon-512.png" },
  { source: "icon-maskable.svg", size: 512, file: "icon-maskable-512.png" },
  { source: "icon-apple.svg", size: 180, file: "apple-touch-icon.png" },
  { source: "icon-any.svg", size: 32, file: "favicon-32.png" },
];

async function launch() {
  const channel = process.env.ICON_CHROMIUM_CHANNEL;
  if (channel) return chromium.launch({ channel });
  try {
    return await webkit.launch();
  } catch {
    return chromium.launch();
  }
}

function icoFromPng(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(32, 6);
  header.writeUInt8(32, 7);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

fs.mkdirSync(outDir, { recursive: true });
const browser = await launch();
const generated = new Map();
try {
  for (const target of targets) {
    const svg = fs.readFileSync(path.join(sourceDir, target.source), "utf8");
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${target.size}px;height:${target.size}px}</style>${svg}`,
    );
    const png = await page.screenshot({ omitBackground: true, type: "png" });
    await page.close();
    fs.writeFileSync(path.join(outDir, target.file), png);
    generated.set(target.file, png);
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(root, "public", "favicon.ico"), icoFromPng(generated.get("favicon-32.png")));
