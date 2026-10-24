"use client";

import { useActionState } from "react";
import { Button, ErrorText, Field } from "@/components/ui";
import { verifyAction } from "../actions";

export function VerifyForm() {
  const [state, action, pending] = useActionState(verifyAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Código" name="code" inputMode="numeric" autoComplete="one-time-code" required maxLength={24} autoFocus />
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>{pending ? "Verificando…" : "Verificar"}</Button>
    </form>
  );
}
