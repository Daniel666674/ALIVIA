"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocStatus, PortalModel } from "@/lib/portal";

type Tier = "esencial" | "plus" | "empresas";
type Scenario = "real" | "inicio" | "proceso" | "presentada" | "aldia";
type TabKey = "inicio" | "documentos" | "declaraciones" | "pagos" | "mensajes" | "obligaciones";
type DocKey = "bank_cert" | "rut" | "dian_key" | "id_doc";

const TIERS: { key: Tier; label: string; rank: number; price: string }[] = [
  { key: "esencial", label: "Esencial", rank: 0, price: "$60.000 al año" },
  { key: "plus", label: "Plus", rank: 1, price: "$96.000 al año" },
  { key: "empresas", label: "Empresas", rank: 2, price: "desde $720.000 al año" },
];
const SCENARIOS: { key: Scenario; label: string }[] = [
  { key: "real", label: "Datos del cliente" },
  { key: "inicio", label: "1 · Recién inicia" },
  { key: "proceso", label: "2 · En proceso" },
  { key: "presentada", label: "3 · Presentada" },
  { key: "aldia", label: "4 · Todo al día" },
];
const TABS: { key: TabKey; label: string; min: Tier; icon: string }[] = [
  { key: "inicio", label: "Inicio", min: "esencial", icon: "M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z" },
  { key: "documentos", label: "Documentos", min: "esencial", icon: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { key: "declaraciones", label: "Declaraciones", min: "plus", icon: "M5 4h14v17l-3-2-2 2-2-2-2 2-2-2-3 2zM8 9h8M8 13h8" },
  { key: "pagos", label: "Pagos", min: "plus", icon: "M3 7h18v12H3zM3 11h18M7 15h3" },
  { key: "mensajes", label: "Mensajes", min: "plus", icon: "M4 5h16v11H9l-5 4z" },
  { key: "obligaciones", label: "Obligaciones", min: "empresas", icon: "M4 20V8l8-5 8 5v12M9 20v-6h6v6" },
];
const DOC_LABEL: Record<DocKey, { title: string; help: string }> = {
  bank_cert: { title: "Certificación bancaria", help: "Con menos de 30 días. Sirve para devoluciones de saldo a favor." },
  rut: { title: "RUT actualizado", help: "El PDF que descarga de la DIAN, con la fecha del año en curso." },
  id_doc: { title: "Documento de identidad", help: "Foto legible de la cédula por ambos lados." },
  dian_key: { title: "Autorización ante la DIAN", help: "Firmamos aquí una autorización. Nunca le pediremos su clave por chat ni por correo." },
};
const DOC_ORDER: DocKey[] = ["bank_cert", "rut", "id_doc", "dian_key"];
const STEPS = ["Recibimos sus documentos", "Preparando su declaración", "Revisión final", "Presentada ante la DIAN", "Carpeta entregada"];

const cop = (n: number) => `$${n.toLocaleString("es-CO")}`;
const dateLong = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dateShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
const daysTo = (today: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
const addDays = (today: string, n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function Ico({ d, size = 20 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

/** What the client's journey looks like in each demo scenario. */
function stateFor(m: PortalModel, sc: Scenario) {
  let docs: Record<DocKey, DocStatus> = { ...m.docs };
  let done = 0; // completed steps of STEPS
  let paid = m.paid;
  let signed = false;
  if (sc === "real") {
    const all = DOC_ORDER.every((k) => docs[k] !== "pending");
    done = m.stage === "presented" ? 4 : m.stage === "in_review" ? 2 : m.stage === "in_preparation" ? 1 : all ? 1 : 0;
  } else if (sc === "inicio") {
    docs = { bank_cert: "pending", rut: "pending", id_doc: "pending", dian_key: "pending" }; done = 0; paid = false;
  } else if (sc === "proceso") {
    docs = { bank_cert: "received", rut: "reviewed", id_doc: "pending", dian_key: "received" }; done = 1; paid = false;
  } else if (sc === "presentada") {
    docs = { bank_cert: "reviewed", rut: "reviewed", id_doc: "reviewed", dian_key: "reviewed" }; done = 4; paid = false;
  } else {
    docs = { bank_cert: "reviewed", rut: "reviewed", id_doc: "reviewed", dian_key: "reviewed" }; done = 5; paid = true; signed = true;
  }
  return { docs, done, paid, signed };
}

const FAKE_FILES: Record<DocKey, string> = { bank_cert: "certificacion-bancaria.pdf", rut: "RUT-2026.pdf", id_doc: "cedula-ambas-caras.jpg", dian_key: "autorizacion-firmada.pdf" };

type Msg = { from: "contador" | "cliente"; text: string; at: string };

export function PortalPreview({ model, options }: { model: PortalModel; options: { id: string; name: string }[] }) {
  const [scenario, setScenario] = useState<Scenario>(model.sample ? "proceso" : "real");
  const [tier, setTier] = useState<Tier>(model.kind === "empresa" ? "empresas" : "plus");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [tab, setTab] = useState<TabKey>("inicio");
  const base = useMemo(() => stateFor(model, scenario), [model, scenario]);
  // Little local simulations (uploads, payment, signature). They belong to one scenario: switching scenario starts clean.
  const [simState, setSimState] = useState<{ sc: Scenario; uploaded: Partial<Record<DocKey, string>>; paid: boolean; signed: boolean }>({ sc: scenario, uploaded: {}, paid: false, signed: false });
  const sim = simState.sc === scenario ? simState : { sc: scenario, uploaded: {}, paid: false, signed: false };
  const uploaded = sim.uploaded;
  const patchSim = (p: Partial<typeof simState>) => setSimState({ ...sim, ...p });
  const [payOpen, setPayOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chat, setChat] = useState<Msg[]>(() => [
    { from: "contador", text: `Hola ${model.name.split(" ")[0]}, soy ${model.responsible.split(" ")[0]} de ${model.firm}. Aquí puede escribirme cuando tenga dudas sobre su declaración.`, at: "Ayer 4:12 p. m." },
  ]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const rank = TIERS.find((t) => t.key === tier)!.rank;
  const allowed = (min: Tier) => rank >= TIERS.find((t) => t.key === min)!.rank;
  const docs: Record<DocKey, DocStatus> = { ...base.docs };
  (Object.keys(uploaded) as DocKey[]).forEach((k) => { if (docs[k] === "pending") docs[k] = "received"; });
  const missing = DOC_ORDER.filter((k) => docs[k] === "pending");
  const received = DOC_ORDER.length - missing.length;
  const done = Math.max(base.done, missing.length === 0 && base.done === 0 ? 1 : 0);
  const paid = base.paid || sim.paid;
  const signed = base.signed || sim.signed;
  const deadline = scenario === "real" ? model.deadline : addDays(model.today, scenario === "inicio" ? 21 : scenario === "proceso" ? 12 : scenario === "presentada" ? -6 : -40);
  const dleft = daysTo(model.today, deadline);
  const first = model.name.split(" ")[0]!;
  const presented = done >= 4;
  const tabs = TABS.filter((t) => t.key !== "obligaciones" || tier === "empresas" || model.kind === "empresa" || true);
  const visibleTabs = device === "phone" ? tabs.filter((t) => t.key !== "obligaciones") : tabs;

  function send(text: string) {
    const t = text.trim();
    if (!t) return;
    setChat((c) => [...c, { from: "cliente", text: t, at: "Ahora" }]);
    setTimeout(() => setChat((c) => [...c, { from: "contador", text: "¡Gracias! Lo reviso y le respondo en el transcurso del día.", at: "Ahora" }]), 1300);
  }

  const frame = device === "phone" ? "mx-auto w-[390px] max-w-full rounded-[38px] border-[10px] border-slate-800 bg-white shadow-2xl" : "mx-auto w-full max-w-[1120px] rounded-2xl border border-slate-200 bg-white shadow-xl";

  return (
    <div className="min-h-screen" style={{ background: "#eef1f7" }}>
      {/* Staff bar */}
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 px-4 py-2.5 text-[12.5px] text-slate-200">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2">
          <Link href={model.clientId ? `/clients/${model.clientId}` : "/dashboard"} className="font-semibold text-white hover:underline">← Volver a Alivia</Link>
          <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 font-semibold text-indigo-200">Vista previa · así lo ve su cliente</span>
          <form method="get" className="flex items-center gap-1.5">
            <label className="text-slate-400" htmlFor="pc">Cliente</label>
            <select id="pc" name="c" defaultValue={model.clientId ?? ""} className="max-w-[200px] rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-slate-100" onChange={(e) => e.currentTarget.form?.submit()}>
              {options.length === 0 && <option value="">Cliente de ejemplo</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </form>
          <Seg label="Escenario" items={SCENARIOS} value={scenario} onChange={setScenario} />
          <Seg label="Plan" items={TIERS} value={tier} onChange={(t) => { setTier(t); }} />
          <Seg label="Pantalla" items={[{ key: "desktop", label: "Computador" }, { key: "phone", label: "Celular" }]} value={device} onChange={setDevice} />
        </div>
        {model.filledFromExample.length > 0 && (
          <p className="mx-auto mt-1.5 max-w-[1180px] text-[11.5px] text-slate-400">Datos simulados donde falta información real: {model.filledFromExample.join(", ")}. Nada de lo que se haga aquí se guarda.</p>
        )}
      </div>

      <div className="px-3 py-6 sm:px-6">
        <div className={frame} style={device === "phone" ? { height: 800, overflow: "hidden", display: "flex", flexDirection: "column" } : undefined}>
          {/* Portal header */}
          <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl text-[13px] font-extrabold text-white" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>{model.firm.slice(0, 1).toUpperCase()}</div>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[14px] font-bold text-slate-900">{model.firm}</div>
              <div className="text-[11.5px] text-slate-500">Portal del cliente</div>
            </div>
            <div className={`${device === "desktop" ? "hidden sm:block" : "hidden"} text-right leading-tight`}>
              <div className="text-[13px] font-semibold text-slate-800">{model.name}</div>
              <div className="text-[11.5px] text-slate-500">{model.kind === "natural" ? "CC" : "NIT"} •••{model.idHint}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-[12px] font-bold text-indigo-700">{model.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}</div>
          </header>

          <div className={device === "desktop" ? "grid md:grid-cols-[200px_1fr]" : "flex min-h-0 flex-1 flex-col"}>
            {/* Nav */}
            {device === "desktop" && (
              <nav className="hidden border-r border-slate-100 p-3 md:block" aria-label="Portal">
                {visibleTabs.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key ? "page" : undefined} className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium ${tab === t.key ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"}`}>
                    <Ico d={t.icon} size={17} /><span className="flex-1">{t.label}</span>{!allowed(t.min) && <span title={`Plan ${t.min}`} className="text-[11px]">🔒</span>}
                  </button>
                ))}
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
                  <div className="font-semibold text-slate-800">Su contador</div>
                  <div className="mt-0.5">{model.responsible}</div>
                  <div className="mt-2 text-slate-500">Plan <b className="text-slate-700">{TIERS.find((t) => t.key === tier)!.label}</b><div className="text-[11px] text-slate-400">{TIERS.find((t) => t.key === tier)!.price}</div></div>
                </div>
              </nav>
            )}

            <main className={`${device === "phone" ? "min-h-0 flex-1 overflow-y-auto" : ""} p-5 sm:p-6`} style={{ background: "#fafbff" }}>
              {/* Mobile tabs (desktop frame on small screens) */}
              {device === "desktop" && (
                <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto md:hidden">
                  {visibleTabs.map((t) => <button key={t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>{t.label}</button>)}
                </div>
              )}

              {!allowed(TABS.find((t) => t.key === tab)!.min) ? (
                <Upsell tab={tab} onUpgrade={(t) => setTier(t)} />
              ) : tab === "inicio" ? (
                <Home {...{ phone: device === "phone", first, model, docs, missing, received, done, paid, presented, deadline, dleft, go: setTab, tier, allowed }} />
              ) : tab === "documentos" ? (
                <Documents {...{ docs, uploaded, signed, onUpload: (k: DocKey) => { patchSim({ uploaded: { ...uploaded, [k]: FAKE_FILES[k] } }); setToast(`✓ Recibimos ${FAKE_FILES[k]}`); } }} />
              ) : tab === "declaraciones" ? (
                <Declarations {...{ presented, model, signed, onSign: () => { patchSim({ signed: true }); setToast("✓ Autorización firmada"); }, tier }} />
              ) : tab === "pagos" ? (
                <Payments {...{ model, paid, presented, onPay: () => setPayOpen(true) }} />
              ) : tab === "mensajes" ? (
                <Chat chat={chat} onSend={send} responsible={model.responsible} />
              ) : (
                <Obligations model={model} />
              )}
            </main>
          </div>

          {/* Phone bottom nav */}
          {device === "phone" && (
            <nav className="grid grid-cols-5 border-t border-slate-100 bg-white px-1 py-1.5" aria-label="Portal">
              {visibleTabs.slice(0, 5).map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`flex flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-semibold ${tab === t.key ? "text-indigo-700" : "text-slate-500"}`}>
                  <Ico d={t.icon} size={19} />{t.label}{!allowed(t.min) ? " 🔒" : ""}
                </button>
              ))}
            </nav>
          )}
        </div>
      </div>

      {payOpen && <PayModal amount={model.feeCop} onClose={() => setPayOpen(false)} onPaid={() => { setPayOpen(false); patchSim({ paid: true }); setToast("✓ Pago recibido. Gracias."); }} />}
      {toast && <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-medium text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Seg<T extends string>({ label, items, value, onChange }: { label: string; items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-400">{label}</span>
      <div className="flex rounded-lg bg-slate-800 p-0.5">
        {items.map((i) => (
          <button key={i.key} type="button" onClick={() => onChange(i.key)} aria-pressed={value === i.key} className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${value === i.key ? "bg-indigo-500 text-white" : "text-slate-300 hover:text-white"}`}>{i.label}</button>
        ))}
      </div>
    </div>
  );
}

const card = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";
const h2 = "text-[15px] font-bold text-slate-900";

function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "blue" | "gray"; children: React.ReactNode }) {
  const c = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", blue: "bg-sky-50 text-sky-700", gray: "bg-slate-100 text-slate-600" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${c}`}>{children}</span>;
}

type HomeProps = { phone: boolean; first: string; model: PortalModel; docs: Record<DocKey, DocStatus>; missing: DocKey[]; received: number; done: number; paid: boolean; presented: boolean; deadline: string; dleft: number; go: (t: TabKey) => void; tier: Tier; allowed: (m: Tier) => boolean };

function Home({ phone, first, model, missing, received, done, paid, presented, deadline, dleft, go, allowed }: HomeProps) {
  const next =
    missing.length > 0 ? { title: `Suba ${missing.length === 1 ? "1 documento" : `${missing.length} documentos`} para avanzar`, text: `Nos falta: ${missing.map((k) => DOC_LABEL[k].title.toLowerCase()).join(", ")}.`, cta: "Subir documentos", tab: "documentos" as TabKey }
    : presented && !paid ? { title: "Su declaración fue presentada", text: `Queda pendiente el pago de honorarios por ${cop(model.feeCop)}.`, cta: allowed("plus") ? "Ver y pagar" : "Ver mi estado", tab: (allowed("plus") ? "pagos" : "inicio") as TabKey }
    : presented ? { title: "Todo al día 🎉", text: "Presentamos su declaración, recibimos su pago y su carpeta está lista.", cta: allowed("plus") ? "Ver mis declaraciones" : "Ver mi estado", tab: (allowed("plus") ? "declaraciones" : "inicio") as TabKey }
    : { title: "Estamos trabajando en su declaración", text: "No necesita hacer nada por ahora. Le avisamos apenas esté presentada.", cta: "Ver el avance", tab: "inicio" as TabKey };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-extrabold text-slate-900">Hola, {first} 👋</h1>
        <p className="text-[13.5px] text-slate-500">Aquí puede ver cómo va su declaración de renta {Number(model.today.slice(0, 4)) - 1} y qué sigue.</p>
      </div>

      <div className="rounded-2xl p-5 text-white shadow-md" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-indigo-200">Lo siguiente para usted</div>
        <div className="mt-1 text-[18px] font-bold">{next.title}</div>
        <p className="mt-1 text-[13.5px] text-indigo-100">{next.text}</p>
        {next.tab !== "inicio" && <button onClick={() => go(next.tab)} className="mt-3 rounded-lg bg-white px-4 py-2 text-[13px] font-bold text-indigo-700 hover:bg-indigo-50">{next.cta}</button>}
      </div>

      <div className={`grid gap-3 ${phone ? "grid-cols-1" : "sm:grid-cols-3"}`}>
        <div className={card}><div className="text-[12px] font-semibold text-slate-500">Documentos</div><div className="mt-1 text-[24px] font-extrabold text-slate-900">{received} <span className="text-[14px] font-semibold text-slate-400">de 4</span></div><Bar pct={received * 25} /></div>
        <div className={card}><div className="text-[12px] font-semibold text-slate-500">Fecha límite</div><div className="mt-1 text-[22px] font-extrabold text-slate-900">{dateShort(deadline)}</div><div className="mt-1">{presented ? <Pill tone="green">Presentada a tiempo</Pill> : dleft < 0 ? <Pill tone="red">Vencida hace {-dleft} d</Pill> : <Pill tone={dleft <= 7 ? "amber" : "blue"}>Faltan {dleft} días</Pill>}</div></div>
        <div className={card}><div className="text-[12px] font-semibold text-slate-500">Honorarios</div><div className="mt-1 text-[22px] font-extrabold text-slate-900">{cop(model.feeCop)}</div><div className="mt-1">{paid ? <Pill tone="green">Pagados</Pill> : presented ? <Pill tone="amber">Pendiente de pago</Pill> : <Pill tone="gray">Se cobra al presentar</Pill>}</div></div>
      </div>

      <section className={card}>
        <h2 className={h2}>Avance de su declaración</h2>
        <ol className="mt-4 space-y-0">
          {STEPS.map((s, i) => {
            const ok = i < done; const cur = i === done;
            return (
              <li key={s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-bold ${ok ? "bg-emerald-500 text-white" : cur ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : "bg-slate-200 text-slate-500"}`}>{ok ? "✓" : i + 1}</span>
                  {i < STEPS.length - 1 && <span className={`my-0.5 w-0.5 flex-1 ${ok ? "bg-emerald-300" : "bg-slate-200"}`} style={{ minHeight: 22 }} />}
                </div>
                <div className="pb-4"><div className={`text-[13.5px] font-semibold ${ok || cur ? "text-slate-900" : "text-slate-400"}`}>{s}</div><div className="text-[12px] text-slate-500">{ok ? "Listo" : cur ? "En este momento" : "Pendiente"}</div></div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={card}>
        <h2 className={h2}>Su contador</h2>
        <div className="mt-3 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-indigo-100 text-[14px] font-bold text-indigo-700">{model.responsible.split(/\s+/).map((p) => p[0]).slice(0, 2).join("")}</span>
          <div className="flex-1"><div className="text-[14px] font-semibold text-slate-900">{model.responsible}</div><div className="text-[12.5px] text-slate-500">{model.firm} · responde en horario laboral</div></div>
          <button onClick={() => go("mensajes")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Escribir{!allowed("plus") ? " 🔒" : ""}</button>
        </div>
      </section>
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }} /></div>;
}

function Documents({ docs, uploaded, signed, onUpload }: { docs: Record<DocKey, DocStatus>; uploaded: Partial<Record<DocKey, string>>; signed: boolean; onUpload: (k: DocKey) => void }) {
  return (
    <div className="space-y-4">
      <div><h1 className="text-[20px] font-extrabold text-slate-900">Mis documentos</h1><p className="text-[13.5px] text-slate-500">Súbalos desde su celular o computador. Quedan guardados cifrados y solo su contador los ve.</p></div>
      <div className="space-y-3">
        {DOC_ORDER.map((k) => {
          const st = docs[k];
          return (
            <div key={k} className={`${card} flex flex-wrap items-center gap-3`}>
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${st === "pending" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}><Ico d="M7 3h7l5 5v13H7zM14 3v5h5" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-slate-900">{DOC_LABEL[k].title}</div>
                <div className="text-[12.5px] text-slate-500">{st === "pending" ? DOC_LABEL[k].help : uploaded[k] ?? FAKE_FILES[k]}</div>
              </div>
              {st === "pending" ? (
                <button onClick={() => onUpload(k)} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-bold text-white hover:bg-indigo-700">{k === "dian_key" ? "Firmar autorización" : "Subir archivo"}</button>
              ) : st === "received" ? <Pill tone="blue">Recibido · en revisión</Pill> : <Pill tone="green">✓ Aprobado</Pill>}
            </div>
          );
        })}
      </div>
      <p className="rounded-xl bg-sky-50 p-3 text-[12.5px] text-sky-800">🔒 Alivia nunca le pide contraseñas. Para la DIAN usamos una autorización firmada por usted.{signed ? " Su autorización de tratamiento de datos ya está firmada." : ""}</p>
    </div>
  );
}

function Declarations({ presented, model, signed, onSign, tier }: { presented: boolean; model: PortalModel; signed: boolean; onSign: () => void; tier: Tier }) {
  const y = Number(model.today.slice(0, 4));
  const rows = [
    ...(presented ? [{ t: `Declaración de renta ${y - 1}`, d: `Presentada el ${dateLong(addDays(model.today, -6))}`, files: ["Declaración (PDF)", "Acuse de la DIAN", "Soporte de pago"] }] : []),
    { t: `Declaración de renta ${y - 2}`, d: `Presentada el ${dateLong(`${y - 1}-10-14`)}`, files: ["Declaración (PDF)", "Acuse de la DIAN"] },
    { t: `Declaración de renta ${y - 3}`, d: `Presentada el ${dateLong(`${y - 2}-08-21`)}`, files: ["Declaración (PDF)"] },
  ];
  return (
    <div className="space-y-4">
      <div><h1 className="text-[20px] font-extrabold text-slate-900">Mis declaraciones</h1><p className="text-[13.5px] text-slate-500">Descargue sus declaraciones y soportes cuando los necesite: bancos, visas, créditos.</p></div>
      {!presented && <div className="rounded-xl bg-amber-50 p-3 text-[13px] text-amber-800">Su declaración de este año aún no está presentada. Aparecerá aquí apenas la presentemos.</div>}
      {rows.map((r) => (
        <section key={r.t} className={card}>
          <div className="flex flex-wrap items-center gap-2"><h2 className={h2}>{r.t}</h2><Pill tone="green">Presentada</Pill></div>
          <p className="text-[12.5px] text-slate-500">{r.d}</p>
          <div className="mt-3 flex flex-wrap gap-2">{r.files.map((f) => <button key={f} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50"><Ico d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" size={15} />{f}</button>)}</div>
        </section>
      ))}
      <section className={card}>
        <h2 className={h2}>Firma electrónica</h2>
        <p className="mt-1 text-[12.5px] text-slate-500">{tier === "esencial" ? "" : "Documentos que su contador necesita que firme."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
          <Ico d="M7 3h7l5 5v13H7zM14 3v5h5" />
          <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold text-slate-900">Autorización de tratamiento de datos</div><div className="text-[12px] text-slate-500">{model.firm}</div></div>
          {signed ? <Pill tone="green">✓ Firmado</Pill> : <button onClick={onSign} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-indigo-700">Firmar desde el celular</button>}
        </div>
      </section>
    </div>
  );
}

function Payments({ model, paid, presented, onPay }: { model: PortalModel; paid: boolean; presented: boolean; onPay: () => void }) {
  const y = Number(model.today.slice(0, 4));
  return (
    <div className="space-y-4">
      <div><h1 className="text-[20px] font-extrabold text-slate-900">Pagos</h1><p className="text-[13.5px] text-slate-500">Pague sus honorarios en línea, sin transferencias ni comprobantes por WhatsApp.</p></div>
      <section className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1"><div className="text-[12.5px] font-semibold text-slate-500">Honorarios declaración de renta {y - 1}</div><div className="text-[28px] font-extrabold text-slate-900">{cop(model.feeCop)}</div></div>
          {paid ? <Pill tone="green">✓ Pagado</Pill> : presented ? <Pill tone="amber">Pendiente</Pill> : <Pill tone="gray">Se habilita al presentar</Pill>}
        </div>
        {!paid && <button disabled={!presented} onClick={onPay} className="mt-4 w-full rounded-xl bg-indigo-600 py-3 text-[14px] font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8">Pagar ahora</button>}
        {!paid && !presented && <p className="mt-2 text-[12px] text-slate-500">El botón se activa cuando presentemos su declaración.</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-[11.5px] font-semibold text-slate-500">{["PSE", "Tarjeta de crédito", "Nequi", "Daviplata"].map((m) => <span key={m} className="rounded-md bg-slate-100 px-2 py-1">{m}</span>)}</div>
      </section>
      <section className={card}>
        <h2 className={h2}>Historial</h2>
        <table className="mt-3 w-full text-left text-[13px]"><thead className="text-[11.5px] uppercase text-slate-400"><tr><th className="py-1">Concepto</th><th>Fecha</th><th className="text-right">Valor</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {paid && <tr><td className="py-2.5 font-medium">Honorarios renta {y - 1}</td><td>Hoy</td><td className="text-right font-semibold">{cop(model.feeCop)}</td></tr>}
            <tr><td className="py-2.5 font-medium">Honorarios renta {y - 2}</td><td>{dateShort(`${y - 1}-10-16`)}</td><td className="text-right font-semibold">{cop(Math.round(model.feeCop * 0.9 / 1000) * 1000)}</td></tr>
            <tr><td className="py-2.5 font-medium">Honorarios renta {y - 3}</td><td>{dateShort(`${y - 2}-08-24`)}</td><td className="text-right font-semibold">{cop(Math.round(model.feeCop * 0.8 / 1000) * 1000)}</td></tr>
          </tbody></table>
      </section>
    </div>
  );
}

function Chat({ chat, onSend, responsible }: { chat: Msg[]; onSend: (t: string) => void; responsible: string }) {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [chat]);
  return (
    <div className="space-y-3">
      <div><h1 className="text-[20px] font-extrabold text-slate-900">Mensajes</h1><p className="text-[13.5px] text-slate-500">Escriba a {responsible} sin salir del portal. Todo queda en su historial.</p></div>
      <section className={`${card} flex flex-col`} style={{ minHeight: 360 }}>
        <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: 340 }}>
          {chat.map((m, i) => (
            <div key={i} className={`flex ${m.from === "cliente" ? "justify-end" : ""}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[13.5px] ${m.from === "cliente" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-800"}`}>{m.text}<div className={`mt-0.5 text-[10.5px] ${m.from === "cliente" ? "text-indigo-200" : "text-slate-400"}`}>{m.at}</div></div>
            </div>
          ))}
          <div ref={end} />
        </div>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onSend(text); setText(""); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escriba su mensaje…" aria-label="Mensaje" className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-[14px] outline-none focus:border-indigo-500" />
          <button className="rounded-xl bg-indigo-600 px-4 text-[13px] font-bold text-white hover:bg-indigo-700">Enviar</button>
        </form>
      </section>
    </div>
  );
}

function Obligations({ model }: { model: PortalModel }) {
  const y = Number(model.today.slice(0, 4));
  const rows: [string, string, string, "green" | "amber" | "blue" | "gray"][] = [
    ["IVA bimestral (3.er bimestre)", `${y}-09-15`, "Presentado", "green"],
    ["Retención en la fuente · octubre", addDays(model.today, 6), "En preparación", "amber"],
    ["ICA bimestral", addDays(model.today, 19), "Pendiente de soportes", "blue"],
    ["Renta personas jurídicas", `${y + 1}-05-12`, "Programada", "gray"],
    ["Información exógena", `${y + 1}-04-24`, "Programada", "gray"],
  ];
  return (
    <div className="space-y-4">
      <div><h1 className="text-[20px] font-extrabold text-slate-900">Obligaciones de {model.name}</h1><p className="text-[13.5px] text-slate-500">Todos los vencimientos tributarios de su empresa en un solo lugar (ejemplo ilustrativo).</p></div>
      <section className={card}>
        <table className="w-full text-left text-[13px]"><thead className="text-[11.5px] uppercase text-slate-400"><tr><th className="py-1">Obligación</th><th>Vence</th><th className="text-right">Estado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(([n, d, s, t]) => <tr key={n}><td className="py-2.5 font-medium text-slate-800">{n}</td><td>{dateShort(d)}</td><td className="text-right"><Pill tone={t}>{s}</Pill></td></tr>)}</tbody></table>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className={card}><h2 className={h2}>Usuarios de la empresa</h2><ul className="mt-3 space-y-2 text-[13px]">{[["Gerencia", "Acceso total"], ["Contabilidad interna", "Documentos y facturas"], ["Tesorería", "Pagos"]].map(([n, r]) => <li key={n} className="flex justify-between"><span className="font-medium">{n}</span><span className="text-slate-500">{r}</span></li>)}</ul></section>
        <section className={card}><h2 className={h2}>Reporte mensual</h2><p className="mt-1 text-[12.5px] text-slate-500">Ingresos, gastos e impuestos del mes, conectado a su software contable.</p><div className="mt-3 flex h-20 items-end gap-1.5">{[40, 55, 48, 66, 72, 61].map((h, i) => <div key={i} className="flex-1 rounded-t bg-indigo-400" style={{ height: `${h}%` }} />)}</div></section>
      </div>
    </div>
  );
}

const UPSELL: Record<TabKey, { need: Tier; title: string; bullets: string[] }> = {
  inicio: { need: "esencial", title: "", bullets: [] },
  documentos: { need: "esencial", title: "", bullets: [] },
  declaraciones: { need: "plus", title: "Sus declaraciones y firmas, siempre a la mano", bullets: ["Descargar declaraciones y soportes de años anteriores", "Firmar autorizaciones desde el celular", "Menos correos pidiendo «el PDF de la renta»"] },
  pagos: { need: "plus", title: "Pague sus honorarios en línea", bullets: ["PSE, tarjeta, Nequi y Daviplata", "Recibo automático y conciliación sin extractos", "Recordatorios amables en vez de cobros incómodos"] },
  mensajes: { need: "plus", title: "Un canal directo con su contador", bullets: ["Preguntas y respuestas con historial", "Adjunte fotos de documentos desde el chat", "Deje de depender de grupos de WhatsApp"] },
  obligaciones: { need: "empresas", title: "El tablero tributario de su empresa", bullets: ["Todos los vencimientos y su estado", "Varios usuarios con distintos permisos", "Reporte mensual conectado a su software contable"] },
};

function Upsell({ tab, onUpgrade }: { tab: TabKey; onUpgrade: (t: Tier) => void }) {
  const u = UPSELL[tab];
  const need = TIERS.find((t) => t.key === u.need)!;
  return (
    <div className="mx-auto max-w-md py-8 text-center">
      <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-indigo-100 text-[24px]">🔒</div>
      <Pill tone="blue">Disponible en el plan {need.label}</Pill>
      <h1 className="mt-3 text-[20px] font-extrabold text-slate-900">{u.title}</h1>
      <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-left text-[13.5px] text-slate-600">{u.bullets.map((b) => <li key={b} className="flex gap-2"><span className="text-emerald-500">✓</span>{b}</li>)}</ul>
      <button onClick={() => onUpgrade(need.key)} className="mt-5 rounded-xl bg-indigo-600 px-6 py-3 text-[14px] font-bold text-white hover:bg-indigo-700">Activar plan {need.label} · {need.price}</button>
      <p className="mt-2 text-[11.5px] text-slate-400">Demostración: así se le ofrece la mejora a su cliente.</p>
    </div>
  );
}

function PayModal({ amount, onClose, onPaid }: { amount: number; onClose: () => void; onPaid: () => void }) {
  const [method, setMethod] = useState("PSE");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-label="Pagar honorarios">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-[17px] font-extrabold text-slate-900">Pagar honorarios</h2>
        <p className="text-[13px] text-slate-500">Total a pagar</p>
        <div className="mb-3 text-[28px] font-extrabold text-slate-900">{cop(amount)}</div>
        <div className="space-y-2">
          {["PSE", "Tarjeta de crédito", "Nequi", "Daviplata"].map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13.5px] font-medium ${method === m ? "border-indigo-500 bg-indigo-50" : "border-slate-200"}`}>
              <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />{m}
            </label>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[11.5px] text-amber-800">Simulación: aquí se abriría la pasarela de pagos (Wompi / PSE). No se cobra nada.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-300 py-2.5 text-[13.5px] font-semibold text-slate-700">Cancelar</button>
          <button disabled={busy} onClick={() => { setBusy(true); setTimeout(onPaid, 1100); }} className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-[13.5px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "Procesando…" : `Pagar con ${method}`}</button>
        </div>
      </div>
    </div>
  );
}
