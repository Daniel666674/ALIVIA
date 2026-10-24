"use client";

import { useActionState } from "react";
import { Button, ErrorText, Field } from "@/components/ui";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <Field label="Correo" name="email" type="email" autoComplete="username" required maxLength={254} />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required maxLength={128} />
      <ErrorText>{state?.error}</ErrorText>
      <Button type="submit" disabled={pending}>{pending ? "Verificando…" : "Ingresar"}</Button>
    </form>
  );
}
