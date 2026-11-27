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

const aiQuestions = {
  Türkçe: [
    { topic: "Sözcükte Anlam", text: 'Aşağıdaki cümlelerin hangisinde "göz" sözcüğü yan anlamıyla kullanılmıştır?', options: ["Gözlerini kısarak uzaklara baktı.", "Annem bana kızgın gözlerle baktı.", "Dolabın üst gözünde eski fotoğraflar vardı.", "Gözlerinden yaşlar süzülüyordu."], correct: 3, explanation: 'C seçeneğinde "göz", dolabın bölmesi anlamındadır; gerçek anlama benzerlik yoluyla kazanılmış bir yan anlamdır. Diğer seçeneklerde organ anlamı vardır.' },
    { topic: "Sözcükte Anlam", text: 'Aşağıdaki cümlelerin hangisinde "ağır" sözcüğü mecaz anlamda kullanılmıştır?', options: ["Bu valiz çok ağır, taşıyamıyorum.", "Ağır demir kapıyı zorla açtık.", "Kamyon ağır yükü yokuşta zor çekti.", "Öğretmenimizin sözleri bana çok ağır geldi."], correct: 4, explanation: 'D seçeneğinde "ağır", kırıcı ve üzücü anlamında kullanılmıştır; bu mecaz anlamdır. Diğer seçeneklerde sözcük fiziksel ağırlığı anlatır.' },
    { topic: "Sözcükte Anlam", text: '"Açık" sözcüğü aşağıdaki cümlelerin hangisinde "anlaşılır, net" anlamında kullanılmıştır?', options: ["Konuyu herkesin anlayacağı açık bir dille anlattı.", "Pencereyi açık bırakma, oda soğuyor.", "Mağaza pazar günleri de açık.", "Açık mavi bir gömlek giymişti."], correct: 1, explanation: 'A seçeneğinde "açık bir dil", kolay anlaşılan anlatım demektir. B ve C\'de "kapalı olmayan", D\'de "rengi koyu olmayan" anlamı vardır.' },
  ],
  "T.C. İnkılap Tarihi ve Atatürkçülük": [
    { topic: "Bir Kahraman Doğuyor", text: "Mustafa Kemal, 1881 yılında Osmanlı Devleti'nin önemli liman şehirlerinden biri olan ........ şehrinde doğmuştur.\n\nBu cümledeki boşluğa aşağıdakilerden hangisi getirilmelidir?", options: ["İstanbul", "Manastır", "Edirne", "Selanik"], correct: 4, explanation: "Mustafa Kemal 1881'de Selanik'te doğmuştur. Selanik, farklı kültürlerin bir arada yaşadığı, fikir akımlarının kolayca yayıldığı bir liman şehriydi." },
    { topic: "Bir Kahraman Doğuyor", text: "Mustafa Kemal'in annesinin adı aşağıdakilerden hangisidir?", options: ["Zübeyde Hanım", "Makbule Hanım", "Latife Hanım", "Fikriye Hanım"], correct: 1, explanation: "Mustafa Kemal'in annesi Zübeyde Hanım, babası Ali Rıza Efendi'dir. Makbule Hanım ise kız kardeşidir." },
  ],
  "Din Kültürü ve Ahlak Bilgisi": [
    { topic: "Kader İnancı", text: "Allah'ın, olacak her şeyi zamanı, yeri ve niteliğiyle ezelde bilmesi ve belirlemesine ne ad verilir?", options: ["Kader", "Kaza", "Tevekkül", "Ecel"], correct: 1, explanation: "Bu tanım kaderdir. Kaza, kaderde belirlenenlerin zamanı gelince gerçekleşmesidir; tevekkül, elinden geleni yaptıktan sonra Allah'a güvenmektir." },
  ],
  İngilizce: [
    { topic: "Friendship", text: "Ayşe: Can you come to my birthday party on Saturday?\nTom: ........ I have to visit my grandparents.\n\nWhich of the following best completes the dialogue?", options: ["Sure, I'd love to.", "Sorry, I can't.", "Yes, of course.", "That sounds great!"], correct: 2, explanation: "Tom büyükanne ve büyükbabasını ziyaret etmesi gerektiğini söylüyor; bu yüzden daveti reddetmelidir. \"Sorry, I can't.\" kibar bir reddetme ifadesidir." },
    { topic: "Friendship", text: "Emma: What do you like most about your best friend?\nLily: ........\n\nWhich of the following best completes the dialogue?", options: ["She is never there when I need her.", "She always tells my secrets.", "She is very supportive and honest.", "She usually breaks her promises."], correct: 3, explanation: "Soru arkadaşın en çok sevilen özelliğini soruyor; olumlu bir özellik gerekir. C seçeneği (destekleyici ve dürüst) dışındakiler olumsuz özelliklerdir." },
  ],
  Matematik: [
    { topic: "Çarpanlar ve Katlar", text: "84 sayısının farklı asal çarpanlarının toplamı kaçtır?", options: ["10", "11", "12", "14"], correct: 3, explanation: "84 = 2 · 2 · 3 · 7 = 2² · 3 · 7 olduğundan farklı asal çarpanlar 2, 3 ve 7'dir. Toplamları 2 + 3 + 7 = 12 olur." },
    { topic: "Çarpanlar ve Katlar", text: "EBOB(24, 36) + EKOK(24, 36) işleminin sonucu kaçtır?", options: ["60", "72", "78", "84"], correct: 4, explanation: "24 = 2³ · 3 ve 36 = 2² · 3². EBOB = 2² · 3 = 12, EKOK = 2³ · 3² = 72. Toplam 12 + 72 = 84 olur." },
    { topic: "Çarpanlar ve Katlar", text: "Kenar uzunlukları 48 cm ve 36 cm olan dikdörtgen biçimindeki bir karton, hiç artmayacak şekilde birbirine eş ve olabildiğince büyük karelere bölünecektir.\n\nBuna göre kaç kare elde edilir?", options: ["12", "9", "16", "24"], correct: 1, explanation: "Karenin kenarı EBOB(48, 36) = 12 cm olmalıdır. Uzun kenara 48 ÷ 12 = 4, kısa kenara 36 ÷ 12 = 3 kare sığar; toplam 4 · 3 = 12 kare elde edilir." },
    { topic: "Çarpanlar ve Katlar", text: "Bir duraktan A hattı otobüsleri 12 dakikada bir, B hattı otobüsleri 18 dakikada bir kalkmaktadır. İki hattın otobüsleri saat 08.00'de birlikte kalktığına göre bir sonraki birlikte kalkış saati kaçtır?", options: ["08.30", "08.36", "08.48", "09.00"], correct: 2, explanation: "Birlikte kalkış aralığı EKOK(12, 18) = 36 dakikadır. 08.00'e 36 dakika eklenince 08.36 bulunur." },
  ],
  "Fen Bilimleri": [
    { topic: "Mevsimlerin Oluşumu", text: "Mevsimlerin oluşmasının temel nedeni aşağıdakilerden hangisidir?", options: ["Dünya'nın Güneş'e olan uzaklığının değişmesi", "Dünya'nın kendi ekseni etrafında dönmesi", "Ay'ın Dünya etrafında dolanması", "Dünya'nın dönme ekseninin eğik olması ve Güneş etrafında dolanması"], correct: 4, explanation: "Eksen eğikliği ve Güneş etrafındaki dolanma nedeniyle güneş ışınlarının geliş açısı ve gündüz süresi yıl içinde değişir; mevsimler bu yüzden oluşur. Kendi ekseni etrafında dönme gece ve gündüzü oluşturur." },
    { topic: "Mevsimlerin Oluşumu", text: "21 Haziran tarihinde Kuzey Yarım Küre'de aşağıdakilerden hangisi gözlenir?", options: ["Yılın en uzun gündüzü yaşanır.", "Gece ve gündüz süreleri eşittir.", "Yılın en kısa gündüzü yaşanır.", "Kış mevsimi başlar."], correct: 1, explanation: "21 Haziran'da güneş ışınları Yengeç Dönencesi'ne dik gelir. Kuzey Yarım Küre'de yaz başlar ve yılın en uzun gündüzü yaşanır." },
    { topic: "Mevsimlerin Oluşumu", text: "Öğle vakti güneş ışınlarının Ekvator'a dik geldiği tarihler aşağıdakilerden hangisinde birlikte verilmiştir?", options: ["21 Haziran - 21 Aralık", "21 Mart - 23 Eylül", "21 Aralık - 21 Mart", "23 Eylül - 21 Haziran"], correct: 2, explanation: "Ekinoks tarihleri olan 21 Mart ve 23 Eylül'de güneş ışınları Ekvator'a dik gelir; bu tarihlerde tüm Dünya'da gece ve gündüz eşittir." },
  ],
};

function assertDemoDatabase() {
  if (!/Database=LGSApp_Demo(;|$)/i.test(connection) || !/\(localdb\)/i.test(connection)) {
    throw new Error("Yapay zekâ metinleri yalnızca yerel LGSApp_Demo veritabanında değiştirilebilir.");
  }
}

function runSql(statements) {
  const file = path.join(os.tmpdir(), `lgs-demo-ai-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(file, `IF DB_NAME() <> N'LGSApp_Demo' THROW 50000, N'Yalnızca LGSApp_Demo', 1;\n${statements.join("\n")}\n`, "utf8");
  const result = spawnSync(sqlcmdPath(), ["-S", "(localdb)\\MSSQLLocalDB", "-d", "LGSApp_Demo", "-E", "-I", "-b", "-f", "65001", "-i", file], { encoding: "utf8" });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(`sqlcmd başarısız: ${result.stdout} ${result.stderr}`);
  return result.stdout;
}

const sqlText = (value) => `N'${value.replace(/'/g, "''").replace(/\r?\n/g, "' + NCHAR(10) + N'")}'`;

export function polishAiSolutions(ids) {
  assertDemoDatabase();
  const literal = (lines) => lines.map((line) => `N'${line.replace(/'/g, "''")}'`).join(" + NCHAR(10) + NCHAR(10) + ");
  runSql(Object.entries(texts).map(([key, lines]) => `UPDATE Solutions SET [Text] = ${literal(lines)} WHERE QuestionId = ${ids[key]} AND [Type] = 4;`));
  console.log("[seed] Yapay zekâ çözüm metinleri gerçekçi çözümlerle değiştirildi (yalnızca yerel LGSApp_Demo)");
}

export function polishAiQuestions() {
  assertDemoDatabase();
  const rows = Object.entries(aiQuestions).flatMap(([lesson, items]) =>
    items.map((q, i) => `(${sqlText(lesson)}, ${i + 1}, ${sqlText(q.topic)}, ${sqlText(q.text)}, ${q.options.map(sqlText).join(", ")}, ${q.correct}, ${sqlText(q.explanation)})`),
  );
  const output = runSql([
    "SET NOCOUNT ON;",
    "DECLARE @c TABLE (Lesson nvarchar(200), Ord int, Topic nvarchar(200), T nvarchar(max), A nvarchar(400), B nvarchar(400), C nvarchar(400), D nvarchar(400), Correct tinyint, E nvarchar(max));",
    `INSERT @c VALUES ${rows.join(",\n")};`,
    "DECLARE @m TABLE (QuestionId int, Ord int, Lesson nvarchar(200));",
    "INSERT @m SELECT q.Id, ROW_NUMBER() OVER (PARTITION BY q.LessonId ORDER BY q.Id), l.Name FROM Questions q JOIN Lessons l ON l.Id = q.LessonId WHERE q.Source = 4;",
    "UPDATE q SET [Text] = c.T, OptionA = c.A, OptionB = c.B, OptionC = c.C, OptionD = c.D, CorrectOption = c.Correct, [Description] = c.E, TopicId = COALESCE((SELECT TOP 1 t.Id FROM Topics t WHERE t.LessonId = q.LessonId AND t.Name = c.Topic), q.TopicId) FROM Questions q JOIN @m m ON m.QuestionId = q.Id JOIN @c c ON c.Lesson = m.Lesson AND c.Ord = m.Ord;",
    "DECLARE @n int = @@ROWCOUNT;",
    "UPDATE s SET [Text] = N'Doğru cevap: ' + NCHAR(64 + c.Correct) + N' şıkkı.' + NCHAR(10) + NCHAR(10) + c.E FROM Solutions s JOIN @m m ON m.QuestionId = s.QuestionId JOIN @c c ON c.Lesson = m.Lesson AND c.Ord = m.Ord WHERE s.[Type] = 4;",
    "SELECT CONCAT('UPDATED=', @n);",
  ]);
  const count = /UPDATED=(\d+)/.exec(output)?.[1] ?? "?";
  console.log(`[seed] ${count} yapay zekâ sorusu gerçekçi metinlerle değiştirildi (yalnızca yerel LGSApp_Demo)`);
}
