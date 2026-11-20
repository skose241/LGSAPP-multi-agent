import { classNameSchema, firstNameSchema, lastNameSchema, userNameSchema } from "./schemas";

export const BULK_MAX_ROWS = 100;
export const BULK_MAX_COLUMNS = 6;

export type BulkField = "firstName" | "lastName" | "userName" | "className" | "role" | "branchLessonId";
export type BulkRole = "ogrenci" | "ogretmen" | "mudur";
export type BulkDelimiter = "," | ";" | "\t";
export type BulkErrors = Partial<Record<BulkField, string>>;

export interface BulkLesson {
  id: number;
  name: string;
}

export interface BulkRow {
  line: number;
  firstName: string;
  lastName: string;
  userName: string;
  className: string;
  roleText: string;
  role: BulkRole | null;
  branchName: string;
  branchLessonId: number | null;
  errors: BulkErrors;
}

export interface BulkParseResult {
  delimiter: BulkDelimiter;
  hasHeader: boolean;
  rows: BulkRow[];
  totalRows: number;
  tooMany: boolean;
  errorCount: number;
}

export interface BulkItemBody {
  userName: string;
  firstName: string;
  lastName: string;
  role: BulkRole;
  className: string | null;
  branchLessonId: number | null;
}

const FOLD: Record<string, string> = { ı: "i", ç: "c", ğ: "g", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

export function foldText(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/[ıçğöşüâîû]/g, (char) => FOLD[char] ?? char)
    .replace(/\s+/g, " ");
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectDelimiter(text: string): BulkDelimiter {
  const source = stripBom(text);
  let inQuotes = false;
  let tabs = 0;
  let semicolons = 0;
  let commas = 0;
  let seenContent = false;
  for (const char of source) {
    if (char === '"') inQuotes = !inQuotes;
    if (inQuotes) continue;
    if (char === "\n" || char === "\r") {
      if (seenContent) break;
      continue;
    }
    if (char.trim() !== "") seenContent = true;
    if (char === "\t") tabs += 1;
    else if (char === ";") semicolons += 1;
    else if (char === ",") commas += 1;
  }
  if (tabs > 0) return "\t";
  if (semicolons > 0) return ";";
  if (commas > 0) return ",";
  return ";";
}

export interface RawRecord {
  line: number;
  cells: string[];
}

export function parseDelimited(text: string, delimiter: BulkDelimiter): RawRecord[] {
  const source = stripBom(text);
  const records: RawRecord[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  function endCell() {
    cells.push(quoted ? cell : cell.trim());
    cell = "";
    quoted = false;
  }

  function endRecord() {
    endCell();
    if (cells.some((value) => value.trim() !== "")) records.push({ line: recordLine, cells: cells.map((value) => value.trim()) });
    cells = [];
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      inQuotes = true;
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      endRecord();
      line += 1;
      recordLine = line;
    } else {
      cell += char;
    }
  }
  endRecord();
  return records;
}

const HEADER_FIRST = new Set(["ad", "adi", "isim", "name", "first name", "firstname"]);
const HEADER_SECOND = new Set(["soyad", "soyadi", "surname", "last name", "lastname"]);

export function isHeaderRecord(cells: string[]): boolean {
  return HEADER_FIRST.has(foldText(cells[0] ?? "")) && HEADER_SECOND.has(foldText(cells[1] ?? ""));
}

export function normalizeRole(value: string): BulkRole | null {
  const folded = foldText(value);
  if (folded === "ogrenci") return "ogrenci";
  if (folded === "ogretmen") return "ogretmen";
  if (folded === "mudur") return "mudur";
  return null;
}

function firstIssue(result: { success: boolean; error?: { issues: { message: string }[] } }): string | null {
  if (result.success) return null;
  return result.error?.issues[0]?.message ?? "Geçersiz değer.";
}

export function parseBulkUsers(text: string, lessons: BulkLesson[]): BulkParseResult {
  const delimiter = detectDelimiter(text);
  const records = parseDelimited(text, delimiter);
  const first = records[0];
  const hasHeader = first ? isHeaderRecord(first.cells) : false;
  const dataRecords = hasHeader ? records.slice(1) : records;
  const totalRows = dataRecords.length;
  const lessonByName = new Map(lessons.map((lesson) => [foldText(lesson.name), lesson]));

  const rows: BulkRow[] = dataRecords.slice(0, BULK_MAX_ROWS).map((record) => {
    const [firstName = "", lastName = "", userName = "", className = "", roleText = "", branchName = ""] = record.cells;
    const role = normalizeRole(roleText);
    const errors: BulkErrors = {};

    const firstNameIssue = firstIssue(firstNameSchema.safeParse(firstName));
    if (firstNameIssue) errors.firstName = firstNameIssue;
    const lastNameIssue = firstIssue(lastNameSchema.safeParse(lastName));
    if (lastNameIssue) errors.lastName = lastNameIssue;
    const userNameIssue = firstIssue(userNameSchema.safeParse(userName));
    if (userNameIssue) errors.userName = userNameIssue;

    if (roleText.trim() === "") errors.role = "Rol zorunlu (ogrenci, ogretmen veya mudur).";
    else if (!role) errors.role = `Rol anlaşılamadı: "${roleText}". ogrenci, ogretmen veya mudur yazın.`;

    const keptClass = role === "ogrenci" ? className : "";
    if (role === "ogrenci") {
      const classIssue = firstIssue(classNameSchema.safeParse(className));
      if (classIssue) errors.className = classIssue;
    }

    let branchLessonId: number | null = null;
    let keptBranch = "";
    if (role === "ogretmen" && branchName.trim() !== "") {
      keptBranch = branchName;
      const lesson = lessonByName.get(foldText(branchName));
      if (lesson) branchLessonId = lesson.id;
      else errors.branchLessonId = `Ders bulunamadı: "${branchName}".`;
    }

    if (record.cells.length > BULK_MAX_COLUMNS) {
      errors.branchLessonId = errors.branchLessonId ?? `Fazla sütun var (en fazla ${BULK_MAX_COLUMNS}).`;
    }

    return {
      line: record.line,
      firstName,
      lastName,
      userName,
      className: keptClass,
      roleText,
      role,
      branchName: keptBranch,
      branchLessonId,
      errors,
    };
  });

  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = row.userName.trim().normalize("NFC").toLowerCase();
    if (key === "") continue;
    const earlier = seen.get(key);
    if (earlier === undefined) seen.set(key, row.line);
    else if (!row.errors.userName) row.errors.userName = `Bu kullanıcı adı listede ${earlier}. satırda da var.`;
  }

  const errorCount = rows.filter((row) => Object.keys(row.errors).length > 0).length;
  return { delimiter, hasHeader, rows, totalRows, tooMany: totalRows > BULK_MAX_ROWS, errorCount };
}

export function toBulkItems(rows: BulkRow[]): BulkItemBody[] {
  return rows.map((row) => ({
    userName: row.userName.trim(),
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim(),
    role: row.role ?? "ogrenci",
    className: row.role === "ogrenci" && row.className.trim() ? row.className.trim() : null,
    branchLessonId: row.role === "ogretmen" ? row.branchLessonId : null,
  }));
}

const FIELD_BY_KEY: Record<string, BulkField> = {
  username: "userName",
  firstname: "firstName",
  lastname: "lastName",
  classname: "className",
  role: "role",
  branchlessonid: "branchLessonId",
};

export interface BulkServerErrors {
  rows: Record<number, BulkErrors>;
  general: string[];
}

export function mapBulkServerErrors(fieldErrors: Record<string, string[]>): BulkServerErrors {
  const result: BulkServerErrors = { rows: {}, general: [] };
  for (const [rawKey, messages] of Object.entries(fieldErrors)) {
    const match = /^(?:\$\.)?items\[(\d+)\]\.([a-z]+)$/i.exec(rawKey.trim());
    const field = match ? FIELD_BY_KEY[(match[2] ?? "").toLowerCase()] : undefined;
    const message = messages[0];
    if (!match || !field || !message) {
      result.general.push(...messages);
      continue;
    }
    const index = Number(match[1]);
    result.rows[index] = { ...result.rows[index], [field]: message };
  }
  return result;
}

export function mergeErrors(client: BulkErrors, server: BulkErrors | undefined): BulkErrors {
  return { ...client, ...server };
}

export const ROLE_LABELS: Record<string, string> = { ogrenci: "Öğrenci", ogretmen: "Öğretmen", mudur: "Müdür" };

export interface PasswordRow {
  fullName: string;
  userName: string;
  className: string;
  role: string;
  password: string;
}

export function toPasswordRows(
  users: { user: { firstName: string; lastName: string; userName: string; className: string | null; role: string | null }; oneTimePassword: string }[],
): PasswordRow[] {
  return users.map(({ user, oneTimePassword }) => ({
    fullName: `${user.firstName} ${user.lastName}`.trim(),
    userName: user.userName,
    className: user.className ?? "",
    role: ROLE_LABELS[user.role ?? ""] ?? user.role ?? "",
    password: oneTimePassword,
  }));
}

function cleanCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, " ");
}

function safeCell(value: string): string {
  const cleaned = cleanCell(value);
  return /^[=+@\t\r-]/.test(value) ? `'${cleaned}` : cleaned;
}

export function passwordsToTsv(rows: PasswordRow[]): string {
  const header = ["Ad Soyad", "Kullanıcı Adı", "Sınıf", "Rol", "Şifre"].join("\t");
  const lines = rows.map((row) =>
    [safeCell(row.fullName), safeCell(row.userName), safeCell(row.className), cleanCell(row.role), cleanCell(row.password)].join("\t"),
  );
  return [header, ...lines].join("\n");
}
