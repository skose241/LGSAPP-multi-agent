import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function locate() {
  let dir = root;
  for (;;) {
    const candidate = path.join(dir, "node_modules", "pdfjs-dist");
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const source = locate();
if (!source) {
  console.error("pdfjs-dist bulunamadı. Önce bağımlılıkları kurun.");
  process.exit(1);
}

const version = JSON.parse(fs.readFileSync(path.join(source, "package.json"), "utf8")).version;
const target = path.join(root, "public", "pdfjs", version);
const parent = path.join(root, "public", "pdfjs");

if (fs.existsSync(parent)) {
  for (const entry of fs.readdirSync(parent)) {
    if (entry !== version) fs.rmSync(path.join(parent, entry), { recursive: true, force: true });
  }
}

fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(source, "legacy", "build", "pdf.worker.min.mjs"), path.join(target, "pdf.worker.min.mjs"));
for (const folder of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const from = path.join(source, folder);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(target, folder), { recursive: true });
}
fs.copyFileSync(path.join(source, "LICENSE"), path.join(target, "LICENSE"));
console.log(`pdfjs-dist ${version} varlıkları public/pdfjs/${version} altına kopyalandı.`);
