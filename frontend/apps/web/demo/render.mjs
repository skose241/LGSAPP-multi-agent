import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
import { demoDir } from "./config.mjs";

const require = createRequire(import.meta.url);
const katex = require("katex");
const katexCss = pathToFileURL(path.join(path.dirname(require.resolve("katex/package.json")), "dist", "katex.min.css")).href;

export const renderDir = path.join(demoDir, "render");

export function m(tex, display = false) {
  return katex.renderToString(tex, { displayMode: display, throwOnError: true, strict: "ignore", output: "html" });
}

const baseCss = `
* { box-sizing: border-box; }
body { margin: 0; font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif; color: #1c2430; }
.katex { font-size: 1.12em; }
`;

const cardCss = `
body { background: #ffffff; padding: 0; }
.card { width: 880px; padding: 34px 44px 38px; background: #fff; border: 2px solid #1f3a5f; border-radius: 10px; }
.head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; border-bottom: 2px solid #1f3a5f; padding-bottom: 12px; }
.no { background: #1f3a5f; color: #fff; font-weight: 700; font-size: 22px; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.meta { font-size: 17px; font-weight: 600; color: #1f3a5f; letter-spacing: .02em; }
.stem { font-size: 25px; line-height: 1.55; margin: 0 0 20px; }
.stem p { margin: 0 0 12px; }
.fig { display: flex; justify-content: center; margin: 8px 0 22px; }
.opts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 14px 30px; }
.opts.one { grid-template-columns: 1fr; }
.opts li { font-size: 24px; line-height: 1.4; display: flex; gap: 10px; padding: 8px 12px; border-radius: 8px; border: 1px solid #c9d3e0; background: #f7f9fc; }
.opts b { color: #1f3a5f; min-width: 28px; }
table.punnett { border-collapse: collapse; font-size: 24px; }
table.punnett td, table.punnett th { border: 2px solid #1f3a5f; width: 84px; height: 56px; text-align: center; }
table.punnett th { background: #e8eef7; }
`;

const paperCss = `
body { background: #6b5a45; padding: 0; }
.desk { width: 1100px; padding: 46px 54px; background: radial-gradient(circle at 30% 20%, #8a7660, #5e4e3b); }
.paper { position: relative; transform: rotate(-1.1deg); background-color: #fffdf4; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 37px, #bcd3e8 37px, #bcd3e8 38px); padding: 30px 46px 34px 78px; box-shadow: 0 10px 26px rgba(0,0,0,.45); font-family: "Ink Free", "Segoe Print", "Bradley Hand", cursive; color: #1d2f6b; font-size: 29px; line-height: 38px; }
.paper::before { content: ""; position: absolute; left: 58px; top: 0; bottom: 0; width: 2px; background: #e18b8b; }
.paper p { margin: 0; }
.paper .opts { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
.paper .opts li { display: block; border: 0; background: none; padding: 0; font-size: 29px; line-height: 38px; }
.paper .opts b { color: #1d2f6b; }
.paper .katex { font-size: 1.05em; }
.paper .pen { color: #1b1b1b; }
.paper .tick { color: #b3261e; }
.paper .fig { margin: 4px 0; }
`;

let browserPromise = null;

async function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ channel: process.env.DEMO_CHROMIUM_CHANNEL || "chrome" });
  }
  return browserPromise;
}

export async function closeRenderer() {
  if (browserPromise) {
    const b = await browserPromise;
    browserPromise = null;
    await b.close();
  }
}

function doc(css, body) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><link rel="stylesheet" href="${katexCss}"><style>${baseCss}${css}</style></head><body>${body}</body></html>`;
}

async function shoot(html, selector, { type = "png", scale = 2, name }) {
  fs.mkdirSync(renderDir, { recursive: true });
  const file = path.join(renderDir, `${name}.html`);
  fs.writeFileSync(file, html);
  const b = await browser();
  const context = await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: scale });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const buffer = await page.locator(selector).screenshot(type === "jpeg" ? { type: "jpeg", quality: 88 } : { type: "png" });
  await context.close();
  return { buffer, mime: type === "jpeg" ? "image/jpeg" : "image/png", ext: type === "jpeg" ? "jpg" : "png" };
}

const letters = ["A", "B", "C", "D"];

function optionsHtml(options, tall) {
  return `<ol class="opts${tall ? " one" : ""}">${options.map((o, i) => `<li><b>${letters[i]})</b><span>${o}</span></li>`).join("")}</ol>`;
}

export function renderQuestionCard({ name, number, lesson, stem, figure, options, single }) {
  const body = `<div class="card"><div class="head"><span class="no">${number}</span><span class="meta">${lesson} - 8. Sınıf LGS Hazırlık</span></div><div class="stem">${stem}</div>${figure ? `<div class="fig">${figure}</div>` : ""}${optionsHtml(options, single)}</div>`;
  return shoot(doc(cardCss, body), ".card", { name });
}

export function renderNotebook({ name, stem, figure, options, extra = "", single }) {
  const body = `<div class="desk"><div class="paper"><div>${stem}</div>${figure ? `<div class="fig">${figure}</div>` : ""}${optionsHtml(options, single)}${extra}</div></div>`;
  return shoot(doc(paperCss, body), ".desk", { name, type: "jpeg", scale: 1.5 });
}

export function renderSolution({ name, lines, title }) {
  const body = `<div class="desk"><div class="paper">${title ? `<p class="pen"><u>${title}</u></p>` : ""}${lines.map((l) => `<p>${l}</p>`).join("")}</div></div>`;
  return shoot(doc(paperCss, body), ".desk", { name, type: "jpeg", scale: 1.5 });
}

const worksheetCss = `
@page { size: 794px 1123px; margin: 0; }
body { background: #fff; }
.sheet { width: 794px; height: 1123px; padding: 36px 40px; page-break-after: always; overflow: hidden; }
.title { font-size: 18px; font-weight: 700; color: #1f3a5f; border-bottom: 2px solid #1f3a5f; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
.q { padding: 12px 12px 16px; border: 1px dashed #b8c2d0; height: 322px; overflow: hidden; }
.qh { margin-bottom: 6px; }
.no { background: #1f3a5f; color: #fff; font-weight: 700; font-size: 14px; width: 26px; height: 26px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; }
.stem { font-size: 14.5px; line-height: 1.5; margin-bottom: 8px; }
.fig { display: flex; justify-content: center; margin: 4px 0 8px; }
.fig svg { max-width: 100%; height: auto; }
.opts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 4px; }
.opts li { font-size: 14px; display: flex; gap: 6px; }
.opts b { color: #1f3a5f; min-width: 20px; }
`;

export function renderWorksheetPdf({ name, items, title }) {
  fs.mkdirSync(renderDir, { recursive: true });
  const pages = [];
  const perPage = 6;
  for (let i = 0; i < items.length; i += perPage) {
    const slice = items.slice(i, i + perPage);
    const html = slice
      .map(
        (item, index) =>
          `<div class="q"><div class="qh"><span class="no">${i + index + 1}</span></div><div class="stem">${item.stem}</div>${item.figure ? `<div class="fig">${item.figure}</div>` : ""}${optionsHtml(item.options, false)}</div>`,
      )
      .join("");
    pages.push(`<div class="sheet"><div class="title"><span>${title}</span><span>Deneme Sınavı - Sayfa ${pages.length + 1}</span></div><div class="grid">${html}</div></div>`);
  }
  return { html: doc(worksheetCss, pages.join("")), name };
}

export async function renderPdf({ html, name }) {
  fs.mkdirSync(renderDir, { recursive: true });
  const file = path.join(renderDir, `${name}.html`);
  fs.writeFileSync(file, html);
  const b = await browser();
  const context = await b.newContext({ viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const buffer = await page.pdf({ width: "794px", height: "1123px", printBackground: true, preferCSSPageSize: false, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  const frames = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".sheet")).map((sheet) => {
      const origin = sheet.getBoundingClientRect();
      return Array.from(sheet.querySelectorAll(".q")).map((q) => {
        const r = q.getBoundingClientRect();
        return { x: (r.left - origin.left) / 794, y: (r.top - origin.top) / 1123, width: r.width / 794, height: r.height / 1123 };
      });
    }),
  );
  await context.close();
  fs.writeFileSync(path.join(renderDir, `${name}.pdf`), buffer);
  return { buffer, frames, file: path.join(renderDir, `${name}.pdf`) };
}
