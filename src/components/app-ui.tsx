import Link from "next/link";
import type { ReactNode } from "react";
import { COLOR_LABEL, STAGE_LABEL, type Color, type Stage } from "@/lib/clients/semaforo";

const DOT: Record<Color, string> = { red: "bg-red-500", yellow: "bg-amber-400", blue: "bg-sky-500", green: "bg-emerald-500" };

export function Dot({ color, size = "h-3 w-3" }: { color: Color; size?: string }) {
  return <span role="img" aria-label={COLOR_LABEL[color]} title={COLOR_LABEL[color]} className={`inline-block shrink-0 rounded-full ${size} ${DOT[color]}`} />;
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "red" | "amber" | "sky" | "brand"; children: ReactNode }) {
  const t = { slate: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-800", sky: "bg-sky-100 text-sky-800", brand: "bg-indigo-100 text-indigo-800" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={stage === "presented" ? "green" : stage === "pending" ? "slate" : "sky"}>{STAGE_LABEL[stage]}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const btn = "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:opacity-60";
export const btnPrimary = `${btn} bg-brand text-white hover:bg-brand-dark`;
export const btnGhost = `${btn} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`;
export const btnSmall = "inline-flex items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50";
export const inputCls = "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30";

export function LinkButton({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={primary ? btnPrimary : btnGhost}>
      {children}
    </Link>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : ""}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
