import Link from "next/link";
import type { ReactNode } from "react";
import { Help } from "@/components/help";
import { Icon, type IconName } from "@/components/icons";
import type { HelpKey } from "@/lib/help";
import { COLOR_LABEL, STAGE_LABEL, type Color, type Stage } from "@/lib/clients/semaforo";

const DOT: Record<Color, string> = { red: "var(--red)", yellow: "#fbbf24", blue: "var(--blue)", green: "var(--green)" };

export function Dot({ color, size = "h-3 w-3" }: { color: Color; size?: string }) {
  return <span role="img" aria-label={COLOR_LABEL[color]} title={COLOR_LABEL[color]} className={`inline-block shrink-0 rounded-full ${size}`} style={{ background: DOT[color] }} />;
}

const BADGE = { slate: "b-gray", green: "b-green", red: "b-red", amber: "b-amber", sky: "b-blue", brand: "b-brand" } as const;
export function Badge({ tone = "slate", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={`badge ${BADGE[tone]}`}>{children}</span>;
}

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={stage === "presented" ? "green" : stage === "pending" ? "slate" : "sky"}>{STAGE_LABEL[stage]}</Badge>;
}

export function PageHeader({ title, subtitle, actions, help }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; help?: HelpKey }) {
  return (
    <div className="view-hd">
      <div>
        <h1>{title}{help && <Help id={help} />}</h1>
        {subtitle && <p className="sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, action, children, className = "", help }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string; help?: HelpKey }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="sec-hd">
          <div>
            <h2 className="sec-title">{title}{help && <Help id={help} />}</h2>
            {subtitle && <p className="sec-sub">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const btnPrimary = "btn btn-primary";
export const btnGhost = "btn btn-secondary";
export const btnSmall = "btn btn-secondary btn-sm";
export const inputCls = "field";

export function LinkButton({ href, children, primary, icon }: { href: string; children: ReactNode; primary?: boolean; icon?: IconName }) {
  return (
    <Link href={href} className={primary ? btnPrimary : btnGhost}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

const TONES = {
  brand: ["var(--brand-light)", "var(--brand)"],
  amber: ["var(--amber-bg)", "var(--amber)"],
  red: ["var(--red-bg)", "var(--red)"],
  green: ["var(--green-bg)", "var(--green)"],
  blue: ["var(--blue-bg)", "var(--blue)"],
  purple: ["var(--purple-bg)", "var(--purple)"],
} as const;

export function Stat({ label, value, hint, hintTone, tone, icon, iconTone, iconBg, iconColor }: { label: string; value: ReactNode; hint?: ReactNode; hintTone?: "up" | "down" | "neutral"; tone?: "red" | "green"; icon?: IconName; iconTone?: keyof typeof TONES; iconBg?: string; iconColor?: string }) {
  const [bg, fg] = [iconBg ?? TONES[iconTone ?? "brand"][0], iconColor ?? TONES[iconTone ?? "brand"][1]];
  return (
    <div className="stat-card">
      {icon && (
        <div className="stat-icon" style={{ background: bg, color: fg }}>
          <Icon name={icon} />
        </div>
      )}
      <div className="stat-val" style={tone === "red" ? { color: "var(--red)" } : tone === "green" ? { color: "var(--green)" } : undefined}>{value}</div>
      <div className="stat-lbl">{label}</div>
      {hint && <div className={`stat-chg ${hintTone ?? "neutral"}`}>{hint}</div>}
    </div>
  );
}

export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hues = ["#4f46e5", "#0d9488", "#f79009", "#2e90fa", "#7c3aed", "#f04438", "#12b76a"];
  const bg = hues[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length]!;
  return <span className="av" style={{ background: bg, width: size, height: size, fontSize: size * 0.37 }} aria-hidden>{initials}</span>;
}
