import path from "node:path";
import { fileURLToPath } from "node:url";

export const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const demoDir = path.join(webDir, ".demo");
export const shotsDir = path.join(demoDir, "shots");
export const stateFile = path.join(demoDir, "state.json");

export const apiPort = Number(process.env.DEMO_API_PORT ?? 5391);
export const webPort = Number(process.env.DEMO_PORT ?? 3200);
export const apiUrl = `http://localhost:${apiPort}`;
export const webUrl = `http://localhost:${webPort}`;
export const proxyKey = process.env.DEMO_PROXY_KEY ?? "demo-proxy-key-0123456789-abcdefghijklmnopqrstu";

export const connection =
  process.env.DEMO_CONNECTION_STRING ??
  "Server=(localdb)\\MSSQLLocalDB;Database=LGSApp_Demo;Trusted_Connection=True;TrustServerCertificate=True;MultipleActiveResultSets=true";

export const pastDays = 2;

export const admin = {
  userName: "demo.mudur",
  initialPassword: "Demo-Mudur-Ilk-Sifre-2026!",
  password: "Demo-Mudur-2026!",
  firstName: "Sistem",
  lastName: "Müdür",
};

export const teacherPassword = "Demo-Ogretmen-2026!";
export const studentPassword = "Demo-Ogrenci-2026!";

export const teachers = [
  { key: "mat", userName: "selin.aydin", firstName: "Selin", lastName: "Aydın", branch: "Matematik" },
  { key: "fen", userName: "murat.demir", firstName: "Murat", lastName: "Demir", branch: "Fen Bilimleri" },
  { key: "tur", userName: "elif.celik", firstName: "Elif", lastName: "Çelik", branch: "Türkçe" },
];

export const students = [
  { key: "ahmet", userName: "ahmet.yildiz", firstName: "Ahmet", lastName: "Yıldız", className: "8-A" },
  { key: "zeynep", userName: "zeynep.kara", firstName: "Zeynep", lastName: "Kara", className: "8-A" },
  { key: "mehmet", userName: "mehmet.ozturk", firstName: "Mehmet", lastName: "Öztürk", className: "8-A" },
  { key: "ayse", userName: "ayse.sahin", firstName: "Ayşe", lastName: "Şahin", className: "8-A" },
  { key: "emre", userName: "emre.arslan", firstName: "Emre", lastName: "Arslan", className: "8-B" },
  { key: "defne", userName: "defne.koc", firstName: "Defne", lastName: "Koç", className: "8-B" },
  { key: "burak", userName: "burak.gunes", firstName: "Burak", lastName: "Güneş", className: "8-B" },
  { key: "ecrin", userName: "ecrin.polat", firstName: "Ecrin", lastName: "Polat", className: "8-B" },
];

export const heroStudent = "zeynep";
export const heroTeacher = "mat";
