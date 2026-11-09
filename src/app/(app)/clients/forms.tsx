"use client";

import { useActionState, useRef } from "react";
import { btnGhost, btnPrimary, inputCls } from "@/components/app-ui";
import { createClientAction, createTaskAction, updateClientAction, uploadDocumentAction } from "./actions";

type Person = { id: string; name: string };
const label = "block text-sm font-medium text-slate-700";
const Err = ({ children }: { children?: string }) => (children ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null);

export function NewClientForm({ people }: { people: Person[] }) {
  const [state, action, pending] = useActionState(createClientAction, undefined);
  return (
    <form action={action} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <label className={label}>Tipo
        <select name="kind" className={`${inputCls} mt-1`} defaultValue="natural">
          <option value="natural">Persona natural</option>
          <option value="empresa">Empresa</option>
        </select>
      </label>
      <label className={label}>Cédula o NIT
        <input name="doc" required className={`${inputCls} mt-1`} placeholder="52.123.456 o 900.123.456-8" inputMode="numeric" />
      </label>
      <label className={`${label} sm:col-span-2`}>Nombre o razón social
        <input name="name" required maxLength={200} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Correo
        <input name="email" type="email" maxLength={254} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Teléfono
        <input name="phone" maxLength={30} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Ciudad
        <input name="city" maxLength={80} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Fecha límite
        <input name="deadline" type="date" className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Honorarios (COP, opcional)
        <input name="fee" inputMode="numeric" placeholder="1.600.000" className={`${inputCls} mt-1`} />
      </label>
      <label className={`${label} sm:col-span-2`}>Responsable
        <select name="responsibleId" className={`${inputCls} mt-1`} defaultValue="">
          <option value="">Sin asignar</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2"><Err>{state?.error}</Err></div>
      <div className="sm:col-span-2"><button className={btnPrimary} disabled={pending}>{pending ? "Guardando…" : "Crear cliente"}</button></div>
    </form>
  );
}

export function EditClientForm({ c, people }: { c: { id: string; name: string; email: string | null; phone: string | null; city: string | null; deadline: string | null; responsibleId: string | null; feeCop: number | null }; people: Person[] }) {
  const [state, action, pending] = useActionState(updateClientAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={c.id} />
      <label className={`${label} sm:col-span-2`}>Nombre
        <input name="name" defaultValue={c.name} required maxLength={200} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Correo
        <input name="email" type="email" defaultValue={c.email ?? ""} maxLength={254} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Teléfono
        <input name="phone" defaultValue={c.phone ?? ""} maxLength={30} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Ciudad
        <input name="city" defaultValue={c.city ?? ""} maxLength={80} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Fecha límite
        <input name="deadline" type="date" defaultValue={c.deadline ?? ""} className={`${inputCls} mt-1`} />
      </label>
      <label className={label}>Honorarios (COP)
        <input name="fee" inputMode="numeric" defaultValue={c.feeCop ? c.feeCop.toLocaleString("es-CO") : ""} className={`${inputCls} mt-1`} />
      </label>
      <label className={`${label} sm:col-span-2`}>Responsable
        <select name="responsibleId" defaultValue={c.responsibleId ?? ""} className={`${inputCls} mt-1`}>
          <option value="">Sin asignar</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <div className="sm:col-span-2"><Err>{state?.error}</Err></div>
      <div className="sm:col-span-2"><button className={btnGhost} disabled={pending}>{pending ? "Guardando…" : "Guardar cambios"}</button></div>
    </form>
  );
}

export function UploadForm({ clientId, kind }: { clientId: string; kind: string }) {
  const [state, action, pending] = useActionState(uploadDocumentAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={async (fd) => { await (action as (f: FormData) => Promise<void>)(fd); ref.current?.reset(); }} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" required aria-label="Archivo" className="max-w-[210px] text-xs file:mr-2 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-semibold" />
      <button className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-60" disabled={pending}>{pending ? "Subiendo…" : "Subir"}</button>
      {state?.error && <span role="alert" className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function TaskForm({ people, clients, clientId }: { people: Person[]; clients?: Person[]; clientId?: string }) {
  const [state, action, pending] = useActionState(createTaskAction, undefined);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={async (fd) => { await (action as (f: FormData) => Promise<void>)(fd); ref.current?.reset(); }} className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <input name="title" required maxLength={200} placeholder="Nueva tarea…" aria-label="Tarea" className={inputCls} />
      <select name="assigneeId" aria-label="Responsable" className={inputCls} defaultValue="">
        <option value="">Sin asignar</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="dueDate" type="date" aria-label="Fecha" className={inputCls} />
      <button className={btnPrimary} disabled={pending}>{pending ? "…" : "Agregar"}</button>
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : clients && (
        <select name="clientId" aria-label="Cliente" className={`${inputCls} sm:col-span-4`} defaultValue="">
          <option value="">Sin cliente</option>
          {clients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {state?.error && <p role="alert" className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
    </form>
  );
}
