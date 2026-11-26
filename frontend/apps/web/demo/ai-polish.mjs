import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { connection } from "./config.mjs";

const texts = {
  mat_esit: [
    "Soruyu adım adım çözelim.",
    "1. Adım: Eşitsizliğin her tarafına 1 ekleyelim. $-3 < 2x-1 \\leq 7$ eşitsizliği $-2 < 2x \\leq 8$ olur.",
    "2. Adım: Her tarafı 2'ye bölelim. Pozitif bir sayıya bölerken eşitsizlik yönü değişmez: $-1 < x \\leq 4$.",
    "3. Adım: Soldaki uç (-1) dahil değildir, sağdaki uç (4) dahildir. Bu aralıktaki tam sayılar $0, 1, 2, 3, 4$ değerleridir.",
    "4. Adım: Toplamları $0+1+2+3+4=10$ bulunur.",
    "Doğru cevap A şıkkıdır.",
  ],
  ogr_kosegen: [
    "Karenin köşegeni, iki kenarıyla birlikte bir dik üçgen oluşturur ve bu üçgenin hipotenüsüdür.",
    "1. Adım: Kenar uzunluğu 6 cm olduğundan dik kenarlar 6 cm ve 6 cm'dir.",
    "2. Adım: Pisagor bağıntısını uygulayalım: $d^2 = 6^2 + 6^2 = 36 + 36 = 72$.",
    "3. Adım: $d = \\sqrt{72} = \\sqrt{36 \\cdot 2} = 6\\sqrt{2}$ cm bulunur.",
    "Kural olarak kenarı $a$ olan karenin köşegeni $a\\sqrt{2}$ dir. Doğru cevap B şıkkıdır.",
  ],
  ogr_asal: [
    "Asal çarpan, verilen sayıyı bölen asal sayılardır.",
    "1. Adım: 36'yı asal çarpanlarına ayıralım: $36 = 2 \\cdot 2 \\cdot 3 \\cdot 3 = 2^2 \\cdot 3^2$.",
    "2. Adım: Farklı asal çarpanlar yalnızca 2 ve 3'tür. Üsler çarpanın kaç kez tekrarlandığını gösterir, toplama katılmaz.",
    "3. Adım: Asal çarpanların toplamı $2+3=5$ olur.",
    "Doğru cevap A şıkkıdır.",
  ],
};

function sqlcmdPath() {
  if (process.env.DEMO_SQLCMD) return process.env.DEMO_SQLCMD;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", ["sqlcmd"], { encoding: "utf8", shell: process.platform === "win32" });
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.split(/\r?\n/)[0].trim();
  for (const version of ["180", "170", "160", "150"]) {
    const candidate = `C:\\Program Files\\Microsoft SQL Server\\Client SDK\\ODBC\\${version}\\Tools\\Binn\\sqlcmd.exe`;
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("sqlcmd bulunamadı (DEMO_SQLCMD ile yol verilebilir).");
}

export function polishAiSolutions(ids) {
  if (!/Database=LGSApp_Demo(;|$)/i.test(connection) || !/\(localdb\)/i.test(connection)) {
    throw new Error("Yapay zekâ çözüm metinleri yalnızca yerel LGSApp_Demo veritabanında değiştirilebilir.");
  }
  const literal = (lines) => lines.map((line) => `N'${line.replace(/'/g, "''")}'`).join(" + NCHAR(10) + NCHAR(10) + ");
  const statements = Object.entries(texts).map(([key, lines]) => `UPDATE Solutions SET [Text] = ${literal(lines)} WHERE QuestionId = ${ids[key]} AND [Type] = 4;`);
  const file = path.join(os.tmpdir(), `lgs-demo-ai-${process.pid}.sql`);
  fs.writeFileSync(file, `${statements.join("\n")}\n`, "utf8");
  const result = spawnSync(sqlcmdPath(), ["-S", "(localdb)\\MSSQLLocalDB", "-d", "LGSApp_Demo", "-E", "-I", "-b", "-f", "65001", "-i", file], { encoding: "utf8" });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(`sqlcmd başarısız: ${result.stdout} ${result.stderr}`);
  console.log("[seed] Yapay zekâ çözüm metinleri gerçekçi çözümlerle değiştirildi (yalnızca yerel LGSApp_Demo)");
}
