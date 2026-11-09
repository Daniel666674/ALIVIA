"use client";

import { useActionState } from "react";
import { btnPrimary } from "@/components/app-ui";
import { uploadCsvAction } from "./actions";

export function UploadCsvForm() {
  const [state, action, pending] = useActionState(uploadCsvAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="block rounded-xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-6 text-center text-sm font-semibold text-indigo-700">
        ⬆ Elija su archivo de Excel o CSV
        <input type="file" name="file" accept=".xlsx,.csv,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="mx-auto mt-3 block text-xs font-normal text-slate-600" />
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      <button className={btnPrimary} disabled={pending}>{pending ? "Leyendo archivo…" : "Subir y revisar"}</button>
    </form>
  );
}
