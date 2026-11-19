"use client";

import {
  fieldError,
  isApiError,
  settingChanges,
  validateCrossRules,
  validateSettingValue,
  type ParsedProblem,
} from "@lgs/api";
import { aiKeys, aiMutations, type AdminSetting } from "@lgs/api/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ProblemBanner, useCountdown, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldShell } from "@/components/ui/field";
import { useBeforeUnload } from "@/features/upload/hooks";
import { toProblemState } from "@/features/student/comment-node";
import { api } from "@/lib/api/client";
import { DIRTY_LEAVE_MESSAGE } from "@/lib/upload/leave-guard";

const inputClasses =
  "block h-12 w-full rounded-md border border-border-strong bg-surface px-4 text-base text-foreground hover:border-neutral-600 focus-visible:border-primary aria-invalid:border-danger aria-invalid:bg-danger-soft";

export interface SettingDisplay {
  label: string;
  hint: string;
  toggle?: boolean;
  caution?: string;
}

export interface SettingSection {
  id: string;
  title?: string;
  description?: string;
  settings: AdminSetting[];
}

function ToggleSetting({
  setting,
  info,
  value,
  onChange,
  disabled,
}: {
  setting: AdminSetting;
  info: SettingDisplay;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const on = value === "1";
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={`label-${setting.key}`} className="text-sm font-semibold">
          {info.label}
        </span>
        <span id={`hint-${setting.key}`} className="text-xs text-muted-foreground">
          {info.hint}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`label-${setting.key}`}
        aria-describedby={`hint-${setting.key}`}
        data-testid={`setting-${setting.key}`}
        disabled={disabled}
        onClick={() => onChange(on ? "0" : "1")}
        className="relative inline-flex h-11 w-16 shrink-0 items-center"
      >
        <span className={on ? "absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-pill bg-primary" : "absolute inset-x-0 top-1/2 h-7 -translate-y-1/2 rounded-pill bg-neutral-500"} aria-hidden="true" />
        <span className={on ? "absolute left-[2.25rem] top-1/2 size-5 -translate-y-1/2 rounded-pill bg-white shadow-sm transition-all" : "absolute left-1 top-1/2 size-5 -translate-y-1/2 rounded-pill bg-white shadow-sm transition-all"} aria-hidden="true" />
        <span className="sr-only">{on ? "Açık" : "Kapalı"}</span>
      </button>
    </div>
  );
}

interface SettingsEditorProps {
  sections: SettingSection[];
  describe: (key: string) => SettingDisplay;
  ariaLabel: string;
  guardLeave?: boolean;
  crossRules?: boolean;
}

export function SettingsEditor({ sections, describe, ariaLabel, guardLeave = false, crossRules = false }: SettingsEditorProps) {
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<ProblemState | null>(null);
  const [serverFields, setServerFields] = useState<ParsedProblem | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const settings = sections.flatMap((section) => section.settings);
  const countdown = useCountdown(serverError?.status === 429 ? serverError.problem.retryAfter : null, serverError?.at);

  const valueOf = (setting: AdminSetting) => edited[setting.key] ?? String(setting.value);
  const changes = settingChanges(settings, edited);
  const changedCount = Object.keys(changes).length;
  useBeforeUnload(guardLeave && changedCount > 0, DIRTY_LEAVE_MESSAGE);

  const mutation = useMutation({
    mutationFn: (payload: Record<string, number>) => aiMutations.updateSettings(api(), payload),
    onSuccess: async (result) => {
      queryClient.setQueryData(aiKeys.settings, result.settings);
      setEdited({});
      setServerError(null);
      setServerFields(null);
      setClientErrors({});
      toast.success(result.changed.length > 0 ? "Ayarlar kaydedildi." : "Değişiklik yoktu.");
      await queryClient.invalidateQueries({ queryKey: aiKeys.status });
    },
    onError: (error: unknown) => {
      setServerError(toProblemState(error));
      setServerFields(isApiError(error) ? error.problem : null);
    },
  });

  function change(key: string, value: string) {
    setEdited((current) => ({ ...current, [key]: value }));
    setClientErrors((current) => {
      if (!(key in current)) return current;
      return Object.fromEntries(Object.entries(current).filter(([name]) => name !== key));
    });
  }

  function submit() {
    const errors: Record<string, string> = {};
    for (const setting of settings) {
      const raw = edited[setting.key];
      if (raw === undefined) continue;
      const problem = validateSettingValue(setting, raw);
      if (problem) errors[setting.key] = problem;
    }
    if (crossRules && Object.keys(errors).length === 0) {
      Object.assign(errors, validateCrossRules(settings, edited));
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0 || changedCount === 0) return;
    mutation.mutate(changes);
  }

  const blocked = countdown > 0;
  const generalError = serverFields && Object.keys(serverFields.fieldErrors).length > 0 && serverError?.status === 400 ? null : serverError;

  function renderSetting(setting: AdminSetting) {
    const info = describe(setting.key);
    if (info.toggle) {
      return <ToggleSetting key={setting.key} setting={setting} info={info} value={valueOf(setting)} onChange={(value) => change(setting.key, value)} disabled={mutation.isPending} />;
    }
    const error = clientErrors[setting.key] ?? (serverFields ? fieldError(serverFields, setting.key) : undefined);
    const field = (
      <FieldShell key={setting.key} label={info.label} hint={`${info.hint} (${setting.min} - ${setting.max}, varsayılan ${setting.defaultValue})`} error={error}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            data-testid={`setting-${setting.key}`}
            value={valueOf(setting)}
            disabled={mutation.isPending}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onChange={(event) => change(setting.key, event.target.value)}
            className={inputClasses}
          />
        )}
      </FieldShell>
    );
    if (!info.caution) return field;
    return (
      <div key={setting.key} className="flex flex-col gap-2">
        {field}
        <p data-testid={`caution-${setting.key}`} className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-foreground">
          <span className="font-semibold">Dikkat:</span> {info.caution}
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
      aria-label={ariaLabel}
    >
      <ProblemBanner state={generalError} countdown={countdown} />
      {sections.map((section) =>
        section.title ? (
          <Card key={section.id} data-testid={`settings-group-${section.id}`}>
            <CardHeader>
              <CardTitle as="h2">{section.title}</CardTitle>
              {section.description ? <CardDescription>{section.description}</CardDescription> : null}
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 lg:grid-cols-2">{section.settings.map(renderSetting)}</div>
            </CardContent>
          </Card>
        ) : (
          <div key={section.id} className="grid gap-3 lg:grid-cols-2">
            {section.settings.map(renderSetting)}
          </div>
        ),
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={mutation.isPending} disabled={changedCount === 0 || blocked} data-testid="settings-save">
          {blocked ? `Bekle (${countdown})` : "Kaydet"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={changedCount === 0 || mutation.isPending}
          onClick={() => {
            setEdited({});
            setClientErrors({});
            setServerError(null);
            setServerFields(null);
          }}
        >
          Değişiklikleri geri al
        </Button>
        <p className="text-sm text-muted-foreground" role="status">
          {changedCount === 0 ? "Değişiklik yok." : `${changedCount} ayar değişti.`}
        </p>
      </div>
    </form>
  );
}
