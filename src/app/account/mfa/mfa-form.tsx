"use client";

import { useActionState } from "react";
import { Button, ErrorText, Field } from "@/components/ui";
import { confirmMfaAction } from "../actions";

export function MfaForm() {
  const [state, action, pending] = useActionState(confirmMfaAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Código de 6 dígitos" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={7} />
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>{pending ? "Verificando…" : "Activar"}</Button>
    </form>
  );
}
