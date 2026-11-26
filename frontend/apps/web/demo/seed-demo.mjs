import fs from "node:fs";
import { activate, adminSession, call, must, session, sleep, uploadFile } from "./api.mjs";
import { admin, demoDir, stateFile, studentPassword, students, teacherPassword, teachers } from "./config.mjs";
import { assignments, commentBodies, extraImages, likedBy, poolQuestions, solutionComments, solutionPhoto, teacherSolutions } from "./content.mjs";
import { polishAiSolutions } from "./ai-polish.mjs";
import { closeRenderer, m, renderNotebook, renderQuestionCard, renderSolution } from "./render.mjs";

const phase = (process.argv.find((a) => a.startsWith("--phase=")) ?? "--phase=main").split("=")[1];
const aiDaily = process.argv.includes("--ai-daily");

const log = (message) => console.log(`[seed] ${message}`);

function loadState() {
  return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { users: {}, ids: {} };
}

function saveState(state) {
  fs.mkdirSync(demoDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

const state = loadState();
const people = {};
let lessons = [];
let settings = {};
let today = "";

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fit(text, min) {
  let result = text;
  const filler = " Adımları tek tek yazarak kontrol ettim.";
  while (result.length < min + 5) result += filler;
  return result;
}

function lessonByName(name) {
  const lesson = lessons.find((l) => l.name === name);
  if (!lesson) throw new Error(`Ders yok: ${name}`);
  return lesson;
}

function topicId(lessonName, topicName) {
  const topic = lessonByName(lessonName).topics.find((t) => t.name === topicName);
  if (!topic) throw new Error(`Konu yok: ${lessonName} / ${topicName}`);
  return topic.id;
}

async function ensureAccounts(adminUser) {
  const specs = [
    ...teachers.map((t) => ({ ...t, role: "ogretmen", password: teacherPassword })),
    ...students.map((s) => ({ ...s, role: "ogrenci", password: studentPassword })),
  ];
  for (const spec of specs) {
    const created = await must(
      "POST",
      "/api/admin/users",
      { token: adminUser.token, body: { userName: spec.userName, firstName: spec.firstName, lastName: spec.lastName, role: spec.role, className: spec.role === "ogrenci" ? spec.className : null } },
      [201],
    );
    await activate(spec.userName, created.oneTimePassword, spec.password);
    if (spec.role === "ogretmen") {
      await must("PUT", `/api/admin/users/${created.user.id}/branch-lesson`, { token: adminUser.token, body: { branchLessonId: lessonByName(spec.branch).id } });
    }
    state.users[spec.key] = { id: created.user.id, userName: spec.userName, role: spec.role };
  }
  saveState(state);
  log(`${teachers.length} öğretmen ve ${students.length} öğrenci hesabı hazır`);
}

async function loginAll() {
  for (const t of teachers) people[t.key] = await session(t.userName, teacherPassword);
  for (const s of students) people[s.key] = await session(s.userName, studentPassword);
}

async function loadLessons(token) {
  lessons = await must("GET", "/api/lessons", { token });
  settings = await must("GET", "/api/settings/public", { token });
}

async function schedulerToday(token) {
  const status = await must("GET", "/api/admin/scheduler/status", { token });
  return status.today;
}

async function createAssignment(spec, startDate, endDate, publish = true) {
  const teacher = people[spec.teacher];
  const lesson = lessonByName(spec.lesson);
  const created = await must("POST", "/api/assignments", { token: teacher.token, body: { lessonId: lesson.id, title: spec.title, description: spec.description, startDate, endDate } }, [201]);
  const items = spec.questions.map((q) => ({
    text: q.text,
    imageFileId: q.imageFileId ?? null,
    optionA: q.options[0],
    optionB: q.options[1],
    optionC: q.options[2],
    optionD: q.options[3],
    correctOption: q.correct,
    topicId: q.topic ? topicId(spec.lesson, q.topic) : null,
    description: null,
  }));
  await must("POST", `/api/assignments/${created.id}/questions`, { token: teacher.token, body: { items } }, [201]);
  if (publish) {
    const detail = await must("GET", `/api/assignments/${created.id}/manage`, { token: teacher.token });
    await must("POST", `/api/assignments/${created.id}/publish`, { token: teacher.token, body: { rowVersion: detail.rowVersion } });
  }
  return created.id;
}

async function assignmentQuestionIds(user, id) {
  const detail = await must("GET", `/api/assignments/${id}`, { token: user.token });
  return detail.questions.map((q) => q.questionId ?? q.id);
}

async function answer(user, questionId, option, text, photo = null) {
  const result = await call("POST", `/api/questions/${questionId}/answers`, {
    token: user.token,
    body: { selectedOption: option, solutionText: text ? fit(text, settings.aciklamaMinKarakter) : null, solutionImageFileId: photo },
  });
  if (result.status !== 200) {
    console.warn(`[seed] UYARI cevap ${user.userName} soru ${questionId}: ${result.status} ${JSON.stringify(result.body)}`);
    return null;
  }
  return result.body;
}

const wrongOption = (correct, salt) => ((correct + salt) % 4) + 1;

async function phasePast() {
  const adminUser = await adminSession();
  await loadLessons(adminUser.token);
  await ensureAccounts(adminUser);
  await loginAll();
  today = await schedulerToday(adminUser.token);
  log(`Geçmiş aşama, sistem tarihi ${today}`);

  const spec = assignments.closed;
  const end = addDays(today, spec.length - 1);
  const id = await createAssignment(spec, today, end);
  const ids = await assignmentQuestionIds(people.zeynep, id);
  const plan = {
    zeynep: [true, true, true],
    ahmet: [true, false, true],
    defne: [true, true, true],
    emre: [true, false, true],
    mehmet: [false, true, false],
    ayse: [true, true, false],
    burak: [false, false, true],
  };
  const texts = {
    true: [
      "Parçadaki bağlaçlara ve vurgulanan cümleye bakarak yazarın asıl vurguladığı düşünceyi belirledim. Diğer seçenekler yalnızca ayrıntıyı anlatıyor.",
      "Ana düşünce, parçanın tamamını kapsayan yargıdır. Seçenekleri parçayla karşılaştırdım ve sadece bu seçenek tüm cümleleri kapsıyor.",
    ],
    false: [
      "Parçada geçen ayrıntıyı ana düşünce sandım. Sonradan okuyunca asıl vurgunun başka bir yerde olduğunu fark ettim.",
      "Seçenekler arasında en çok tanıdık gelen cümleyi işaretledim, parçanın tamamını kapsayıp kapsamadığını kontrol etmedim.",
    ],
  };
  let index = 0;
  for (const [key, results] of Object.entries(plan)) {
    for (let q = 0; q < ids.length; q += 1) {
      const correct = spec.questions[q].correct;
      const ok = results[q];
      const option = ok ? correct : wrongOption(correct, 1 + q);
      await answer(people[key], ids[q], option, texts[ok ? "true" : "false"][(index + q) % 2]);
    }
    index += 1;
  }
  state.ids.closedAssignment = id;
  saveState(state);
  log(`Geçmiş ödev oluşturuldu ve çözüldü (id ${id}, bitiş ${end})`);
}

const imageCache = {};

async function cardFor(q, number) {
  const render = q.kind === "notebook"
    ? await renderNotebook({ name: q.key, stem: q.stem, figure: q.figure, options: q.options, single: q.single })
    : await renderQuestionCard({ name: q.key, number, lesson: q.lesson, stem: q.stem, figure: q.figure, options: q.options, single: q.single });
  imageCache[q.key] = render;
  return render;
}

async function createPoolQuestion(q, number) {
  const author = people[q.author];
  const render = await cardFor(q, number);
  const fileId = await uploadFile(author, "questionImage", render.buffer, render.mime, `${q.key}.${render.ext}`);
  const isStudent = q.kind === "notebook";
  const created = await must(
    "POST",
    "/api/questions",
    {
      token: author.token,
      body: {
        lessonId: lessonByName(q.lesson).id,
        topicId: topicId(q.lesson, q.topic),
        text: null,
        imageFileId: fileId,
        optionA: null,
        optionB: null,
        optionC: null,
        optionD: null,
        correctOption: q.marked ?? q.correct,
        description: isStudent ? fit(q.description, settings.aciklamaMinKarakter) : null,
        scheduledPublishDate: null,
        clientRequestId: crypto.randomUUID(),
      },
    },
    [200, 201],
  );
  state.ids[q.key] = created.id;
  return created.id;
}

const answerPlan = {
  zeynep: { mat_us: 1, mat_kok: 1, mat_ucgen: 1, mat_esit: 0, mat_carpan: 1, fen_mevsim: 1, fen_kalitim: 1, fen_basinc: 1, tur_deyim: 1, tur_fiilimsi: 1, ogr_basinc: 2, ogr_ozne: 1, ogr_asal: 1 },
  ahmet: { mat_us: 0, mat_kok: 0, mat_ucgen: 1, mat_esit: 0, mat_carpan: 1, fen_mevsim: 1, fen_kalitim: 1, fen_basinc: 1, fen_asit: 1, tur_deyim: 1, ogr_kosegen: 1, ogr_besin: 1 },
  defne: { mat_us: 1, mat_kok: 1, mat_ucgen: 0, mat_esit: 1, mat_carpan: 1, fen_mevsim: 1, fen_kalitim: 0, fen_basinc: 1, fen_asit: 1, tur_deyim: 1, tur_fiilimsi: 1, ogr_kosegen: 1 },
  emre: { mat_us: 1, mat_ucgen: 0, mat_esit: 1, fen_mevsim: 0, fen_kalitim: 1, fen_asit: 0, tur_deyim: 1, ogr_kosegen: 1, ogr_asal: 0 },
  mehmet: { mat_us: 0, mat_kok: 1, mat_ucgen: 0, mat_esit: 0, fen_kalitim: 0, mat_carpan: 1, fen_basinc: 0, tur_fiilimsi: 1, ogr_besin: 0 },
  ayse: { mat_us: 1, mat_ucgen: 0, fen_kalitim: 0, fen_mevsim: 1, fen_asit: 0, tur_deyim: 1, ogr_kosegen: 0 },
  burak: { mat_us: 0, mat_kok: 0, mat_ucgen: 0, fen_kalitim: 0, fen_basinc: 1, tur_fiilimsi: 0 },
  ecrin: { mat_us: 1, fen_kalitim: 0, fen_asit: 0 },
};

async function answerPool() {
  let studentIndex = 0;
  for (const [key, plan] of Object.entries(answerPlan)) {
    let n = 0;
    for (const [qKey, mode] of Object.entries(plan)) {
      const q = poolQuestions.find((p) => p.key === qKey);
      const questionId = state.ids[qKey];
      const keyOption = q.marked ?? q.correct;
      let option;
      let ok;
      if (mode === 2) {
        option = q.correct;
        ok = false;
      } else {
        ok = mode === 1;
        option = ok ? keyOption : wrongOption(q.correct, 1 + ((studentIndex + n) % 3));
        if (!ok && option === q.correct) option = wrongOption(q.correct, 2);
      }
      const texts = ok || mode === 2 ? q.right : q.wrong;
      let photo = null;
      if ((qKey === "mat_ucgen" || qKey === "fen_basinc") && ok && n % 2 === 0) {
        const sol = solutionPhoto.student;
        const render = await renderSolution({ name: `cozum_${key}_${qKey}`, title: sol.title, lines: sol.lines });
        photo = await uploadFile(people[key], "solutionImage", render.buffer, render.mime, `cozum.${render.ext}`);
      }
      await answer(people[key], questionId, option, texts[(studentIndex + n) % texts.length], photo);
      n += 1;
    }
    studentIndex += 1;
  }
  log("Öğrenci cevapları girildi");
}

async function likes() {
  for (const [qKey, keys] of Object.entries(likedBy)) {
    for (const key of keys) {
      const result = await call("PUT", `/api/questions/${state.ids[qKey]}/like`, { token: people[key].token });
      if (result.status !== 204) console.warn(`[seed] UYARI beğeni ${key} ${qKey}: ${result.status}`);
    }
  }
  log("Beğeniler eklendi");
}

async function postComment(user, questionId, body, parentId = null, solutionId = null) {
  const result = await must("POST", `/api/questions/${questionId}/comments`, { token: user.token, body: { body, parentId, solutionId } }, [201]);
  return result.id;
}

async function threads(teacherSolutionId) {
  const esit = state.ids.mat_esit;
  const c1 = await postComment(people.zeynep, esit, "Eksi 1'in aralığa dahil olup olmadığını karıştırdım ve 9 bulmuştum. Küçük işareti eşitlik içermediği için eksi 1 dahil değilmiş, şimdi anladım.");
  const c2 = await postComment(people.ahmet, esit, "Ben de aynı yerde takıldım. Sayı doğrusunda göstermek işe yarıyor: eksi 1 boş daire, 4 dolu daire.", c1);
  await postComment(people.zeynep, esit, "Boş ve dolu daire fikri çok iyi, teşekkürler! Bir daha karıştırmam.", c2);
  await postComment(people.mat, esit, "Zeynep, doğru tespit. Açık uç (boş daire) ile kapalı uç (dolu daire) ayrımı eşitsizliklerin temelidir. Çözümümü de aşağıya ekledim, adımları karşılaştırabilirsiniz.", c1);
  await postComment(people.defne, esit, "4'ü dahil etmeyi hep unutuyordum, bu soru iyi bir tekrar oldu.");
  if (teacherSolutionId) await postComment(people.ahmet, esit, "Hocam, çözümdeki ilk adım çok net anlatılmış. Her tarafa aynı sayıyı eklemeyi artık unutmam.", null, teacherSolutionId);

  const mevsim = state.ids.fen_mevsim;
  const m1 = await postComment(people.defne, mevsim, solutionComments.fen_mevsim[0][1]);
  await postComment(people.emre, mevsim, solutionComments.fen_mevsim[1][1], m1);
  await postComment(people.fen, mevsim, solutionComments.fen_mevsim[2][1], m1);

  const kose = state.ids.ogr_kosegen;
  const k1 = await postComment(people.ahmet, kose, solutionComments.ogr_kosegen[0][1]);
  await postComment(people.zeynep, kose, solutionComments.ogr_kosegen[1][1], k1);
  await postComment(people.mat, kose, solutionComments.ogr_kosegen[2][1], k1);

  const us = state.ids.mat_us;
  let parent = null;
  for (const [who, body] of commentBodies.mat_us) parent = await postComment(people[who], us, body, parent);
  log("Tartışma dizileri oluşturuldu");
}

async function aiSolutions() {
  const targets = [
    ["zeynep", "mat_esit"],
    ["ahmet", "ogr_kosegen"],
    ["emre", "ogr_asal"],
  ];
  for (const [who, qKey] of targets) {
    const result = await call("POST", `/api/questions/${state.ids[qKey]}/solutions/ai`, { token: people[who].token });
    if (result.status !== 200 && result.status !== 201) console.warn(`[seed] UYARI yapay zekâ çözümü ${qKey}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  log("Yapay zekâ çözümleri istendi");
}

async function teacherSolution(teacherKey, qKey, text, photoSpec) {
  let imageFileId = null;
  if (photoSpec) {
    const render = await renderSolution({ name: `ogretmen_${qKey}`, title: photoSpec.title, lines: photoSpec.lines });
    imageFileId = await uploadFile(people[teacherKey], "solutionImage", render.buffer, render.mime, `cozum.${render.ext}`);
  }
  const created = await must("POST", `/api/questions/${state.ids[qKey]}/solutions/teacher`, { token: people[teacherKey].token, body: { text, imageFileId } }, [201]);
  return created.id;
}

async function reports() {
  await must(
    "POST",
    `/api/questions/${state.ids.ogr_basinc}/reports`,
    {
      token: people.zeynep.token,
      body: { reason: "wrongAnswerKey", description: "Basınç P eşittir F bölü A formülüyle 600 bölü 200 hesaplayınca 3 N/cm² çıkıyor, ama cevap anahtarı 2 N/cm² olan B şıkkını gösteriyor. Cevap anahtarının kontrol edilmesini rica ederim." },
    },
    [201],
  );
  await must(
    "POST",
    `/api/questions/${state.ids.mat_carpan}/reports`,
    { token: people.mehmet.token, body: { reason: "incomplete", description: "Soruda hangi sayılardan söz edildiği eksik gibi geldi, şıkları anlamlandıramadım." } },
    [201],
  );
  const list = await must("GET", "/api/admin/reports?status=pending&pageSize=50", { token: people.mat.token });
  const target = list.items.find((item) => item.questionId === state.ids.mat_carpan);
  if (target) {
    await must("POST", `/api/admin/reports/${target.id}/resolve`, {
      token: people.mat.token,
      body: { action: "reject", note: "Soru eksiksiz: 48 ve 72 sayıları açıkça verilmiş. Ortak bölen kavramı için konu özetine tekrar bakabilirsin.", correctOption: null, rowVersion: target.rowVersion },
    });
  }
  log("Şikâyetler oluşturuldu (1 bekleyen, 1 sonuçlanan)");
}

async function openAssignmentWork() {
  const spec = assignments.open;
  const id = await createAssignment(spec, today, addDays(today, spec.length - 1));
  state.ids.openAssignment = id;
  const ids = await assignmentQuestionIds(people.zeynep, id);
  const plan = {
    zeynep: [1, 1, 1, 0],
    defne: [1, 1, 1, 1],
    ahmet: [1, 0, 1],
    emre: [1, 1],
    mehmet: [0],
    ecrin: [1],
  };
  const right = [
    "Özdeşliği açtım: iki ifadenin farkında kareler birbirini götürüyor ve geriye 4 çarpı 3 çarpı x, yani 12x kalıyor.",
    "Kare farkı özdeşliğini kullandım: x kare eksi 9 eşittir x eksi 3 çarpı x artı 3. Çarpanlara ayırma sonucu doğrudan çıktı.",
    "İki terimin farkının karesini açtım: birinci terimin karesi, eksi iki kere çarpımları, artı ikinci terimin karesi.",
    "Verilen eşitliğin karesini alınca x kare artı 2 artı 1 bölü x kare eşittir 16 çıktı, buradan 14 buldum.",
  ];
  const wrong = [
    "Parantezleri tek tek açmadan iç değerleri çıkardım ve ortadaki çarpım terimini unuttum.",
    "Kare farkı yerine tam kare özdeşliğini kullandım, bu yüzden sonuç yanlış çıktı.",
    "Eksi işaretini dağıtmayı atladım ve orta terimin işaretini yanlış yazdım.",
    "Karesini alırken ikili çarpımı hesaba katmadım, yalnızca terimlerin karelerini topladım.",
  ];
  let studentIndex = 0;
  for (const [key, results] of Object.entries(plan)) {
    for (let q = 0; q < results.length; q += 1) {
      const ok = results[q] === 1;
      const correct = spec.questions[q].correct;
      await answer(people[key], ids[q], ok ? correct : wrongOption(correct, 1 + q), ok ? right[q] : wrong[q]);
    }
    studentIndex += 1;
  }
  log(`Açık ödev oluşturuldu (id ${id})`);

  const sched = assignments.scheduled;
  state.ids.scheduledAssignment = await createAssignment(sched, addDays(today, sched.startOffset), addDays(today, sched.startOffset + sched.length - 1));
  log("Planlı ödev oluşturuldu");

  const draft = {
    teacher: "mat",
    lesson: "Matematik",
    title: "Olasılık: Ön Hazırlık Soruları",
    description: "Taslak ödev: basit olayların olma olasılığı konusu için hazırlanıyor.",
    questions: [
      { topic: "Basit Olayların Olma Olasılığı", text: "Bir torbada 4 kırmızı, 5 mavi ve 3 yeşil bilye vardır. Torbadan rastgele çekilen bir bilyenin mavi olma olasılığı kaçtır?", options: ["$\\dfrac{1}{3}$", "$\\dfrac{5}{12}$", "$\\dfrac{5}{7}$", "$\\dfrac{1}{2}$"], correct: 2 },
      { topic: "Basit Olayların Olma Olasılığı", text: "Hilesiz bir madeni para ve hilesiz bir zar birlikte atılıyor. Paranın yazı, zarın ise 3'ten büyük gelme olasılığı kaçtır?", options: ["$\\dfrac{1}{6}$", "$\\dfrac{1}{4}$", "$\\dfrac{1}{3}$", "$\\dfrac{1}{2}$"], correct: 2 },
    ],
  };
  state.ids.draftAssignment = await createAssignment(draft, addDays(today, 3), addDays(today, 7), false);
  log("Taslak ödev oluşturuldu");
}

async function schedulePlans(adminUser) {
  const items = [];
  const counts = { Türkçe: 3, "T.C. İnkılap Tarihi ve Atatürkçülük": 2, "Din Kültürü ve Ahlak Bilgisi": 1, İngilizce: 2, Matematik: 4, "Fen Bilimleri": 3 };
  for (const lesson of lessons) {
    for (let day = 1; day <= 7; day += 1) {
      const weekend = day >= 6;
      items.push({ isoDayOfWeek: day, lessonId: lesson.id, questionCount: weekend ? 1 : (counts[lesson.name] ?? 1) });
    }
  }
  await must("PUT", "/api/admin/generation-schedule", { token: adminUser.token, body: { items } });

  const plan = {
    mat: ["Kareköklü İfadeler", "Cebirsel İfadeler ve Özdeşlikler", "Doğrusal Denklemler", "Eşitsizlikler", "Üçgenler"],
    fen: ["Basit Makineler", "Besin Zinciri ve Enerji Akışı", "Enerji Dönüşümleri", "Asitler ve Bazlar", "Periyodik Sistem"],
    tur: ["Paragrafta Anlam", "Cümle Türleri", "Yazım Kuralları", "Noktalama İşaretleri", "Söz Sanatları"],
  };
  const lessonOf = { mat: "Matematik", fen: "Fen Bilimleri", tur: "Türkçe" };
  for (const [key, topics] of Object.entries(plan)) {
    for (let i = 0; i < topics.length; i += 1) {
      const date = addDays(today, i + 1);
      await must("PUT", `/api/topic-plans/${date}/${lessonByName(lessonOf[key]).id}`, { token: people[key].token, body: { topicId: topicId(lessonOf[key], topics[i]), targetCount: null, rowVersion: null } });
    }
  }
  log("Ders programı ve konu planları girildi");
}

async function waitRun(token, id) {
  for (let i = 0; i < 600; i += 1) {
    const run = await must("GET", `/api/admin/scheduler/runs/${id}`, { token });
    if (run.status !== "running") return run;
    await sleep(500);
  }
  throw new Error(`Zamanlayıcı çalıştırması ${id} bitmedi.`);
}

async function runScheduler(adminUser, kind) {
  const started = await call("POST", "/api/admin/scheduler/runs", { token: adminUser.token, body: { kind } });
  if (started.status !== 202) {
    console.warn(`[seed] UYARI zamanlayıcı ${kind}: ${started.status} ${JSON.stringify(started.body)}`);
    return null;
  }
  const run = await waitRun(adminUser.token, started.body.id);
  log(`Zamanlayıcı ${kind}: ${run.status} (${run.summary ?? ""})`);
  return run;
}

async function phaseMain() {
  const adminUser = await adminSession();
  await loadLessons(adminUser.token);
  await loginAll();
  today = await schedulerToday(adminUser.token);
  log(`Ana aşama, sistem tarihi ${today}`);

  await runScheduler(adminUser, "assignments");

  let number = 1;
  const order = ["mat_us", "mat_kok", "mat_ucgen", "mat_esit", "mat_carpan", "fen_mevsim", "fen_kalitim", "fen_basinc", "fen_asit", "tur_deyim", "tur_fiilimsi", "ogr_kosegen", "ogr_basinc", "ogr_ozne", "ogr_asal", "ogr_besin"];
  for (const key of order) {
    const q = poolQuestions.find((p) => p.key === key);
    await createPoolQuestion(q, number);
    number += 1;
  }
  log(`${order.length} soru yayınlandı`);

  await answerPool();
  await likes();

  const solutionId = await teacherSolution("mat", "mat_esit", teacherSolutions.mat_esit, solutionPhoto.mat_esit);
  await aiSolutions();
  polishAiSolutions(state.ids);
  await teacherSolution("mat", "ogr_asal", teacherSolutions.ogr_asal, null);
  await threads(solutionId);
  await reports();
  await openAssignmentWork();
  await schedulePlans(adminUser);

  if (aiDaily) {
    await runScheduler(adminUser, "generate");
    await runScheduler(adminUser, "publish");
  }

  saveState(state);
  log("Demo verisi hazır");
}

try {
  if (phase === "past") await phasePast();
  else await phaseMain();
} catch (error) {
  console.error(`[seed] HATA: ${error instanceof Error ? error.stack : error}`);
  process.exitCode = 1;
} finally {
  await closeRenderer();
}
