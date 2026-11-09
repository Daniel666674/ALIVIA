"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { track } from "@/components/usage-tracker";
import { deleteTaskAction, moveTaskAction } from "../clients/actions";

export type KTask = { id: string; title: string; status: "open" | "doing" | "review" | "done"; dueDate: string | null; clientId: string | null; clientName: string | null; assigneeName: string | null };

const COLS = [
  { key: "open", label: "Por hacer", color: "var(--t3)" },
  { key: "doing", label: "En curso", color: "var(--blue)" },
  { key: "review", label: "En revisión", color: "var(--amber)" },
  { key: "done", label: "Hecha", color: "var(--green)" },
] as const;

const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });

/** Kanban board: drag cards between columns, or use the "Mover a" select (keyboard / phone friendly). */
export function KanbanBoard({ initial, canWrite, today }: { initial: KTask[]; canWrite: boolean; today: string }) {
  const [tasks, setTasks] = useState(initial);
  const [over, setOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function move(id: string, status: KTask["status"]) {
    const prev = tasks;
    const t = prev.find((x) => x.id === id);
    if (!t || t.status === status) return;
    setError(null);
    setTasks(prev.map((x) => (x.id === id ? { ...x, status } : x)));
    track("task.move", { to: status });
    start(async () => {
      const ok = await moveTaskAction(id, status).catch(() => false);
      if (!ok) {
        setTasks(prev);
        setError("No se pudo mover la tarea. Intente de nuevo.");
      }
    });
  }

  function remove(id: string) {
    const prev = tasks;
    setTasks(prev.filter((x) => x.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    start(async () => {
      try {
        await deleteTaskAction(fd);
      } catch {
        setTasks(prev);
      }
    });
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          const late = col.key !== "done" ? items.filter((t) => t.dueDate && t.dueDate < today).length : 0;
          return (
            <section
              key={col.key}
              aria-label={col.label}
              className="flex min-h-[220px] flex-col rounded-xl border p-2.5 transition-colors"
              style={{ background: over === col.key ? "var(--brand-light)" : "var(--ws-bg)", borderColor: over === col.key ? "var(--brand)" : "var(--ws-border)" }}
              onDragOver={(e) => { if (canWrite) { e.preventDefault(); setOver(col.key); } }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id && canWrite) move(id, col.key); }}
            >
              <header className="mb-2 flex items-center gap-2 px-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: col.color }} />
                <h3 className="text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{col.label}</h3>
                <span className="rounded-full px-1.5 text-[11px] font-bold" style={{ background: "var(--ws-border)", color: "var(--t2)" }}>{items.length}</span>
                {late > 0 && <span className="badge b-red ml-auto">{late} vencida{late > 1 ? "s" : ""}</span>}
              </header>
              <div className="flex flex-1 flex-col gap-2">
                {items.length === 0 && <p className="px-1 py-4 text-center text-[12px]" style={{ color: "var(--t3)" }}>{canWrite ? "Arrastre tareas aquí" : "Sin tareas"}</p>}
                {items.map((t) => {
                  const isLate = t.status !== "done" && !!t.dueDate && t.dueDate < today;
                  return (
                    <article
                      key={t.id}
                      draggable={canWrite}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; }}
                      className="rounded-lg border bg-white p-2.5 shadow-sm"
                      style={{ borderColor: isLate ? "rgba(240,68,56,.45)" : "var(--ws-border)", cursor: canWrite ? "grab" : "default" }}
                    >
                      <div className={`text-[13px] font-medium ${t.status === "done" ? "line-through" : ""}`} style={{ color: t.status === "done" ? "var(--t3)" : "var(--t1)" }}>{t.title}</div>
                      <div className="mt-1 text-[11.5px]" style={{ color: "var(--t3)" }}>
                        {t.clientId ? <Link href={`/clients/${t.clientId}`} className="hover:underline">{t.clientName}</Link> : "Sin cliente"}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {t.assigneeName ? (
                          <span className="inline-flex items-center gap-1 text-[11.5px]" style={{ color: "var(--t2)" }} title={t.assigneeName}>
                            <span className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: "var(--brand)" }}>{initials(t.assigneeName)}</span>
                            {t.assigneeName.split(" ")[0]}
                          </span>
                        ) : <span className="text-[11.5px]" style={{ color: "var(--t3)" }}>Sin asignar</span>}
                        {t.dueDate && <span className={`badge ml-auto ${isLate ? "b-red" : "b-gray"}`}>{shortDate(t.dueDate)}</span>}
                      </div>
                      {canWrite && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <select aria-label={`Mover tarea ${t.title}`} value={t.status} onChange={(e) => move(t.id, e.target.value as KTask["status"])} className="field !py-1 !text-[11.5px]">
                            {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                          </select>
                          <button type="button" onClick={() => remove(t.id)} className="text-xs text-slate-400 hover:text-red-600" aria-label="Eliminar tarea">✕</button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
