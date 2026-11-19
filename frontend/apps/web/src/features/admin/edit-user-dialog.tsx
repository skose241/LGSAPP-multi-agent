"use client";

import { fieldError, isApiError, type ParsedProblem } from "@lgs/api";
import { adminKeys, adminMutations, type AdminUser } from "@lgs/api/queries";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ProblemBanner, type ProblemState } from "@/components/problem-banner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/field";
import { api } from "@/lib/api/client";
import { toUpdateBody, updateUserSchema, type UpdateUserValues } from "@/lib/admin/schemas";

type FieldName = "firstName" | "lastName" | "className";
const FIELDS: FieldName[] = ["firstName", "lastName", "className"];

interface EditUserDialogProps {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function valuesOf(user: AdminUser): UpdateUserValues {
  return { firstName: user.firstName, lastName: user.lastName, className: user.className ?? "" };
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent title="Bilgileri düzenle" description="Ad, soyad ve (öğrenciler için) sınıf güncellenir. Rol değişmez.">
        <EditUserForm user={user} onClose={() => onOpenChange(false)} onPending={setPending} />
      </DialogContent>
    </Dialog>
  );
}

function EditUserForm({ user, onClose, onPending }: { user: AdminUser; onClose: () => void; onPending: (pending: boolean) => void }) {
  const queryClient = useQueryClient();
  const [problem, setProblem] = useState<ProblemState | null>(null);
  const isStudent = user.role === "ogrenci";

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UpdateUserValues>({ resolver: zodResolver(updateUserSchema), defaultValues: valuesOf(user) });

  const mutation = useMutation({
    mutationFn: (values: UpdateUserValues) => adminMutations.updateUser(api(), user.id, toUpdateBody(values, isStudent)),
    onMutate: () => onPending(true),
    onSettled: () => onPending(false),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
      toast.success("Kullanıcı bilgileri güncellendi.");
      onClose();
    },
    onError: async (error: unknown) => {
      if (!isApiError(error)) {
        setProblem({ status: 0, at: Date.now(), problem: emptyProblem("Bağlantı kurulamadı. Tekrar dene.") });
        return;
      }
      for (const name of FIELDS) {
        const message = fieldError(error.problem, name);
        if (message) setError(name, { message });
      }
      setProblem({ status: error.status, problem: error.problem, at: Date.now() });
      if (error.status === 409) await queryClient.invalidateQueries({ queryKey: adminKeys.users() });
    },
  });

  const hasFieldError = FIELDS.some((name) => Boolean(errors[name]));
  const showBanner = problem !== null && !(problem.status === 400 && hasFieldError);

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        setProblem(null);
        mutation.mutate(values);
      })}
    >
      {showBanner ? <ProblemBanner state={problem} conflictAsMessage /> : null}
      <TextField label="Ad" required autoComplete="off" error={errors.firstName?.message} {...register("firstName")} />
      <TextField label="Soyad" required autoComplete="off" error={errors.lastName?.message} {...register("lastName")} />
      {isStudent ? (
        <TextField label="Sınıf" autoComplete="off" placeholder="8-A" error={errors.className?.message} {...register("className")} />
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary" disabled={mutation.isPending}>
            Vazgeç
          </Button>
        </DialogClose>
        <Button type="submit" loading={mutation.isPending}>
          Kaydet
        </Button>
      </DialogFooter>
    </form>
  );
}

function emptyProblem(message: string): ParsedProblem {
  return { message, fieldErrors: {}, formError: null, retryAfter: null };
}
