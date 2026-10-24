"use client";

import { useActionState } from "react";
import { Button, ErrorText, Field } from "@/components/ui";
import { changePasswordAction } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Contraseña actual" name="current" type="password" autoComplete="current-password" required maxLength={128} />
      <Field label="Contraseña nueva (mín. 12 caracteres)" name="next" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <Field label="Repite la contraseña nueva" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar contraseña"}</Button>
    </form>
  );
}
