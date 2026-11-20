"use client";

import { fieldError, type ParsedProblem } from "@lgs/api";
import { TextAreaField, TextField } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select-field";
import type { AssignmentFormErrors, AssignmentFormValues } from "@/lib/teacher/assignments";

export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 1000;

interface FieldsProps {
  values: AssignmentFormValues;
  onChange: (patch: Partial<AssignmentFormValues>) => void;
  errors: AssignmentFormErrors;
  problem: ParsedProblem | null;
  minDate: string;
  startDisabled?: boolean;
  endDisabled?: boolean;
  textDisabled?: boolean;
  startHint?: string;
  lessonField?: {
    value: number | "";
    onChange: (value: number | null) => void;
    options: { id: number; name: string }[];
    disabled: boolean;
    error?: string;
    hint?: string;
  };
}

export function AssignmentFields({ values, onChange, errors, problem, minDate, startDisabled, endDisabled, textDisabled, startHint, lessonField }: FieldsProps) {
  const server = (name: string) => (problem ? fieldError(problem, name) : undefined);

  return (
    <div className="grid gap-4">
      {lessonField ? (
        <SelectField
          label="Ders"
          required
          value={lessonField.value}
          disabled={lessonField.disabled}
          hint={lessonField.hint}
          error={lessonField.error ?? server("lessonId")}
          onChange={(event) => lessonField.onChange(event.target.value ? Number(event.target.value) : null)}
        >
          <option value="">Ders Seç</option>
          {lessonField.options.map((lesson) => (
            <option key={lesson.id} value={lesson.id}>
              {lesson.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <TextField
        label="Başlık"
        hint="Boş bırakırsanız ders adı başlık olur."
        value={values.title}
        maxLength={TITLE_MAX}
        disabled={textDisabled}
        error={errors.title ?? server("title")}
        onChange={(event) => onChange({ title: event.target.value })}
      />

      <TextAreaField
        label="Açıklama"
        value={values.description}
        maxLength={DESCRIPTION_MAX}
        disabled={textDisabled}
        error={errors.description ?? server("description")}
        hint={`${values.description.length} / ${DESCRIPTION_MAX}`}
        onChange={(event) => onChange({ description: event.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Başlangıç Tarihi"
          type="date"
          required
          min={minDate}
          value={values.startDate}
          disabled={startDisabled}
          hint={startHint}
          error={errors.startDate ?? server("startDate")}
          onChange={(event) => onChange({ startDate: event.target.value })}
        />
        <TextField
          label="Bitiş Tarihi"
          type="date"
          required
          min={values.startDate || minDate}
          value={values.endDate}
          disabled={endDisabled}
          error={errors.endDate ?? server("endDate")}
          onChange={(event) => onChange({ endDate: event.target.value })}
        />
      </div>
    </div>
  );
}
