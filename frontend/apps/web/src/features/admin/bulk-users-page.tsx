"use client";

import { isApiError } from "@lgs/api";
import { adminKeys, adminMutations, lessonsQuery, type BulkCreatedUsers } from "@lgs/api/queries";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, FileUp, Printer, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TextAreaField } from "@/components/ui/field";
import { useBeforeUnload } from "@/features/upload/hooks";
import { api } from "@/lib/api/client";
import {
  BULK_MAX_ROWS,
  mapBulkServerErrors,
  mergeErrors,
  parseBulkUsers,
  passwordsToTsv,
  ROLE_LABELS,
  toBulkItems,
  toPasswordRows,
  type BulkErrors,
  type BulkRow,
  type BulkServerErrors,
} from "@/lib/admin/bulk-users";
import { PASSWORDS_LEAVE_MESSAGE } from "@/lib/upload/leave-guard";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 512 * 1024;

const FIELD_LABELS: Record<keyof BulkErrors, string> = {
  firstName: "Ad",
  lastName: "Soyad",
  userName: "Kullanıcı Adı",
  className: "Sınıf",
  role: "Rol",
  branchLessonId: "Branş",
};

function toProblem(error: unknown): ProblemState {
  if (isApiError(error)) return { status: error.status, problem: error.problem, at: Date.now() };
  return {
    status: 0,
    at: Date.now(),
    problem: { message: "Bağlantı kurulamadı. Tekrar deneyin.", fieldErrors: {}, formError: null, retryAfter: null },
  };
}

function CellError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <span className="block text-xs font-medium text-danger-soft-foreground">{message}</span>;
}

function errorText(errors: BulkErrors): string {
  return (Object.keys(errors) as (keyof BulkErrors)[])
    .map((key) => `${FIELD_LABELS[key]}: ${errors[key] ?? ""}`)
    .join(" · ");
}

interface PreviewProps {
  rows: BulkRow[];
  server: BulkServerErrors | null;
}

function PreviewList({ rows, server }: PreviewProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-surface xl:block">
        <table className="w-full table-fixed text-left text-sm" data-testid="bulk-preview">
          <caption className="sr-only">Önizleme</caption>
          <colgroup>
            <col className="w-[7%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[22%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead className="bg-surface-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Satır</th>
              <th scope="col" className="px-3 py-3 font-semibold">Ad</th>
              <th scope="col" className="px-3 py-3 font-semibold">Soyad</th>
              <th scope="col" className="px-3 py-3 font-semibold">Kullanıcı Adı</th>
              <th scope="col" className="px-3 py-3 font-semibold">Sınıf</th>
              <th scope="col" className="px-3 py-3 font-semibold">Rol</th>
              <th scope="col" className="px-3 py-3 font-semibold">Branş</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const errors = mergeErrors(row.errors, server?.rows[index]);
              const invalid = Object.keys(errors).length > 0;
              return (
                <tr key={index} data-testid="bulk-row" data-invalid={invalid} className={cn("border-t border-border align-top", invalid && "bg-danger-soft text-danger-soft-foreground")}>
                  <td className="px-3 py-2">{row.line}</td>
                  <td className="break-words px-3 py-2">
                    {row.firstName || "-"}
                    <CellError message={errors.firstName} />
                  </td>
                  <td className="break-words px-3 py-2">
                    {row.lastName || "-"}
                    <CellError message={errors.lastName} />
                  </td>
                  <td className="break-all px-3 py-2 font-mono">
                    {row.userName || "-"}
                    <CellError message={errors.userName} />
                  </td>
                  <td className="break-words px-3 py-2">
                    {row.className || "-"}
                    <CellError message={errors.className} />
                  </td>
                  <td className="break-words px-3 py-2">
                    {row.role ? ROLE_LABELS[row.role] : row.roleText || "-"}
                    <CellError message={errors.role} />
                  </td>
                  <td className="break-words px-3 py-2">
                    {row.branchName || "-"}
                    <CellError message={errors.branchLessonId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:hidden" aria-label="Önizleme kartları">
        {rows.map((row, index) => {
          const errors = mergeErrors(row.errors, server?.rows[index]);
          const invalid = Object.keys(errors).length > 0;
          return (
            <li
              key={index}
              data-testid="bulk-row"
              data-invalid={invalid}
              className={cn("flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]", invalid ? "border-danger bg-danger-soft text-danger-soft-foreground" : "border-border bg-surface")}
            >
              <p className="text-xs text-muted-foreground">Satır {row.line}</p>
              <p className="break-words font-semibold">
                {row.firstName || "-"} {row.lastName || "-"}
              </p>
              <CellError message={errors.firstName} />
              <CellError message={errors.lastName} />
              <p className="break-all font-mono">{row.userName || "-"}</p>
              <CellError message={errors.userName} />
              <p>
                {row.role ? ROLE_LABELS[row.role] : row.roleText || "-"}
                {row.className ? ` · ${row.className}` : ""}
                {row.branchName ? ` · ${row.branchName}` : ""}
              </p>
              <CellError message={errors.role} />
              <CellError message={errors.className} />
              <CellError message={errors.branchLessonId} />
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ResultPanel({ result, onDone }: { result: BulkCreatedUsers; onDone: () => void }) {
  const rows = useMemo(() => toPasswordRows(result.users), [result]);
  const [leaving, setLeaving] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(passwordsToTsv(rows));
      toast.success("Tablo panoya kopyalandı.");
    } catch {
      toast.error("Kopyalanamadı. Tabloyu yazdırın ya da elle not alın.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 print:hidden">
        <h2 className="text-2xl">{rows.length} Hesap Oluşturuldu</h2>
        <p className="text-muted-foreground">Tek seferlik şifreler aşağıda. Kullanıcılar ilk girişte şifrelerini değiştirmek zorunda kalacak.</p>
      </div>
      <div
        role="note"
        data-testid="bulk-warning"
        className="flex items-start gap-3 rounded-md border border-warning bg-warning-soft p-3 text-sm font-medium text-warning-soft-foreground print:hidden"
      >
        <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        Bu şifreler bir daha gösterilmeyecek. Sayfadan ayrılmadan önce yazdırın ya da kopyalayıp güvenli bir yere kaydedin.
      </div>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button type="button" onClick={() => window.print()} data-testid="bulk-print">
          <Printer aria-hidden="true" />
          Yazdır
        </Button>
        <Button type="button" variant="secondary" onClick={copy} data-testid="bulk-copy">
          <Copy aria-hidden="true" />
          Kopyala
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface" tabIndex={0} role="region" aria-label="Tek seferlik şifre tablosu">
        <table id="toplu-sifreler" className="w-full text-left text-sm" data-testid="bulk-result">
          <caption className="sr-only">Tek Seferlik Şifreler</caption>
          <thead className="bg-surface-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 font-semibold">Ad Soyad</th>
              <th scope="col" className="px-3 py-3 font-semibold">Kullanıcı Adı</th>
              <th scope="col" className="px-3 py-3 font-semibold">Sınıf</th>
              <th scope="col" className="px-3 py-3 font-semibold">Rol</th>
              <th scope="col" className="px-3 py-3 font-semibold">Şifre</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userName} className="border-t border-border align-top" data-testid="bulk-result-row">
                <td className="break-words px-3 py-2">{row.fullName}</td>
                <td className="break-all px-3 py-2 font-mono" data-testid="bulk-result-username">{row.userName}</td>
                <td className="px-3 py-2">{row.className || "-"}</td>
                <td className="px-3 py-2">{row.role}</td>
                <td className="break-all px-3 py-2 font-mono font-semibold" data-testid="bulk-result-password">{row.password}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border pt-4 print:hidden">
        <Button type="button" variant="secondary" onClick={() => setLeaving(true)} data-testid="bulk-new">
          Şifreleri Not Aldım, Yeni Liste
        </Button>
        <Button asChild variant="secondary">
          <Link href="/yonetim/kullanicilar">Listeye Dön</Link>
        </Button>
      </div>

      <ConfirmDialog
        open={leaving}
        onOpenChange={setLeaving}
        title="Şifreler ekrandan silinsin mi?"
        description="Şifreler bir daha gösterilmeyecek. Not aldığınızdan emin olun."
        confirmLabel="Evet, Yeni Liste"
        tone="danger"
        onConfirm={() => {
          setLeaving(false);
          onDone();
        }}
      />
    </div>
  );
}

export function BulkUsersPage() {
  const queryClient = useQueryClient();
  const lessons = useQuery(lessonsQuery(api()));
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [server, setServer] = useState<BulkServerErrors | null>(null);
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const [result, setResult] = useState<BulkCreatedUsers | null>(null);
  const [confirmMudur, setConfirmMudur] = useState(false);
  const countdown = useCountdown(problem?.status === 429 ? problem.problem.retryAfter : null, problem?.at);

  useBeforeUnload(result !== null, PASSWORDS_LEAVE_MESSAGE);

  const parsed = useMemo(
    () => parseBulkUsers(text, (lessons.data ?? []).map((lesson) => ({ id: lesson.id, name: lesson.name }))),
    [text, lessons.data],
  );
  const mudurCount = parsed.rows.filter((row) => row.role === "mudur").length;
  const serverErrorRows = server ? Object.keys(server.rows).length : 0;

  const mutation = useMutation({
    gcTime: 0,
    mutationFn: () => adminMutations.bulkCreateUsers(api(), toBulkItems(parsed.rows)),
    onSuccess: async (data) => {
      setResult(data);
      setProblem(null);
      setServer(null);
      setText("");
      await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
    onError: async (error: unknown) => {
      const state = toProblem(error);
      setProblem(state);
      if (state.status === 400) setServer(mapBulkServerErrors(state.problem.fieldErrors));
      if (state.status === 409) await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });

  const resetMutation = mutation.reset;
  useEffect(() => () => resetMutation(), [resetMutation]);

  function changeText(value: string) {
    setText(value);
    setServer(null);
    setProblem(null);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Dosya çok büyük. En fazla 512 KB olabilir.");
      return;
    }
    changeText(await file.text());
    if (fileInput.current) fileInput.current.value = "";
  }

  const hasRows = parsed.rows.length > 0;
  const blocked =
    !hasRows ||
    parsed.errorCount > 0 ||
    parsed.tooMany ||
    lessons.isPending ||
    (mudurCount > 0 && !confirmMudur) ||
    countdown > 0 ||
    serverErrorRows > 0;

  const summaryItems = parsed.rows
    .map((row, index) => ({ row, errors: mergeErrors(row.errors, server?.rows[index]) }))
    .filter((entry) => Object.keys(entry.errors).length > 0);

  const showBanner = problem !== null && !(problem.status === 400 && server !== null);
  const generalServer = server?.general ?? [];

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/yonetim/kullanicilar"
        className="inline-flex min-h-touch items-center gap-2 self-start text-sm font-semibold text-primary underline underline-offset-4 print:hidden"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kullanıcılar
      </Link>
      <div className="print:hidden">
        <h1 className="text-3xl">Toplu Kullanıcı Ekle</h1>
        <p className="text-muted-foreground">Bir listeyi yapıştırın ya da CSV dosyası seçin. Hepsi birlikte oluşturulur; biri hatalıysa hiçbiri oluşturulmaz.</p>
      </div>

      {result ? (
        <Card>
          <CardContent>
            <ResultPanel
              result={result}
              onDone={() => {
                setResult(null);
                mutation.reset();
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <TextAreaField
                label="Kullanıcı Listesi"
                hint="Sütunlar: ad; soyad; kullanıcı adı; sınıf; rol; branş dersi (yalnız öğretmen, isteğe bağlı). Rol: ogrenci, ogretmen veya mudur. Ayırıcı (; , ya da sekme) ve başlık satırı otomatik algılanır. Excel'den kopyalayıp yapıştırabilirsiniz."
                value={text}
                onChange={(event) => changeText(event.target.value)}
                placeholder={"Ali;Yılmaz;ali.yilmaz;8-A;ogrenci\nAyşe;Demir;ayse.demir;;ogretmen;Matematik"}
                spellCheck={false}
                autoCapitalize="none"
                rows={8}
                className="font-mono text-sm"
                data-testid="bulk-text"
              />
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.tsv,.txt,text/csv,text/plain"
                  aria-label="CSV dosyası seç"
                  className="sr-only"
                  data-testid="bulk-file"
                  onChange={(event) => void readFile(event.target.files?.[0])}
                />
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                  <FileUp aria-hidden="true" />
                  Dosya Seç
                </Button>
                <p className="text-xs text-muted-foreground">UTF-8 kodlu .csv dosyası, en fazla {BULK_MAX_ROWS} satır.</p>
              </div>
            </CardContent>
          </Card>

          {showBanner ? <ProblemBanner state={problem} countdown={countdown} conflictAsMessage /> : null}

          {parsed.tooMany ? (
            <div role="status" data-testid="bulk-too-many" className="rounded-md border border-danger bg-danger-soft p-3 text-sm font-medium text-danger-soft-foreground">
              En fazla {BULK_MAX_ROWS} satır eklenebilir; listede {parsed.totalRows} satır var. Fazlasını ikinci bir listede ekleyin.
            </div>
          ) : null}

          {hasRows ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl">Önizleme</h2>
                <Badge tone="neutral">{parsed.rows.length} Satır</Badge>
                {summaryItems.length > 0 ? <Badge tone="danger">{summaryItems.length} Hatalı</Badge> : <Badge tone="success">Hata Yok</Badge>}
              </div>

              {summaryItems.length > 0 || generalServer.length > 0 ? (
                <div role="status" data-testid="bulk-error-summary" className="rounded-md border border-danger bg-danger-soft p-3 text-sm text-danger-soft-foreground [overflow-wrap:anywhere]">
                  <p className="font-semibold">
                    {summaryItems.length > 0 ? `${summaryItems.length} satırda hata var. Listeyi düzeltip yeniden deneyin.` : "İstek reddedildi."}
                  </p>
                  {generalServer.length > 0 ? <p>{generalServer.join(" ")}</p> : null}
                  <ul className="mt-1 list-disc pl-5">
                    {summaryItems.slice(0, 8).map(({ row, errors }) => (
                      <li key={row.line} className="break-words">
                        Satır {row.line}: {errorText(errors)}
                      </li>
                    ))}
                  </ul>
                  {summaryItems.length > 8 ? <p className="mt-1">... ve {summaryItems.length - 8} satır daha.</p> : null}
                </div>
              ) : null}

              <PreviewList rows={parsed.rows} server={server} />

              {mudurCount > 0 ? (
                <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-md border border-warning bg-warning-soft p-3 text-base font-semibold text-warning-soft-foreground">
                  <input type="checkbox" className="size-6 shrink-0 accent-primary" checked={confirmMudur} onChange={(event) => setConfirmMudur(event.target.checked)} />
                  Listede {mudurCount} müdür hesabı var; oluşturmak istediğimi onaylıyorum
                </label>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="lg" disabled={blocked} loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="bulk-submit">
                  Hesapları Oluştur ({parsed.rows.length})
                </Button>
                {countdown > 0 ? <span className="text-sm text-muted-foreground">{countdown} sn sonra tekrar denenebilir.</span> : null}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
