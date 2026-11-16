import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const shippedDevPackages = ["@fontsource-variable/bricolage-grotesque", "@fontsource-variable/figtree"];
const names = [...Object.keys(manifest.dependencies ?? {}), ...shippedDevPackages]
  .filter((name) => !String(manifest.dependencies?.[name] ?? "").startsWith("workspace:"))
  .sort((a, b) => a.localeCompare(b));

function locate(name) {
  let dir = root;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function repositoryOf(pkg) {
  const raw = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (!raw) return pkg.homepage ?? null;
  const cleaned = raw
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^ssh:\/\/git@/, "https://")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(cleaned)) return `https://github.com/${cleaned}`;
  return cleaned.startsWith("http") ? cleaned : (pkg.homepage ?? null);
}

function copyrightOf(dir) {
  const files = fs.readdirSync(dir).filter((file) => /^(licen[cs]e|copying)/i.test(file));
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const line = text.split(/\r?\n/).find((entry) => /^\s*copyright/i.test(entry));
    if (line) return line.trim();
  }
  return null;
}

function licenseOf(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((entry) => entry.type).join(" OR ");
  return "UNKNOWN";
}

const packages = names.map((name) => {
  const file = locate(name);
  if (!file) throw new Error(`${name} paketi node_modules içinde bulunamadı.`);
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    name,
    version: pkg.version,
    license: licenseOf(pkg),
    copyright: copyrightOf(path.dirname(file)),
    repository: repositoryOf(pkg),
    npm: `https://www.npmjs.com/package/${name}/v/${pkg.version}`,
  };
});

const target = path.join(root, "src", "lib", "licenses", "third-party.json");
fs.writeFileSync(target, `${JSON.stringify({ packages }, null, 2)}\n`);
console.log(`${packages.length} paket yazıldı: ${path.relative(root, target)}`);
