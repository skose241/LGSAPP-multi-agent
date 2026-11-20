"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { OneTimePasswordPanel } from "@/features/admin/one-time-password";

interface OneTimePasswordDialogProps {
  result: { userName: string; displayName: string; password: string } | null;
  onClose: () => void;
}

export function OneTimePasswordDialog({ result, onClose }: OneTimePasswordDialogProps) {
  return (
    <Dialog open={result !== null}>
      {result ? (
        <DialogContent
          title="Yeni Tek Seferlik Şifre"
          description={`${result.displayName} için şifre yenilendi. Kullanıcının eski oturumları kapandı.`}
          hideClose
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <OneTimePasswordPanel userName={result.userName} displayName={result.displayName} password={result.password} />
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              Şifreyi Not Aldım
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
