const TZ = "America/Bogota";

export function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const a = Date.parse(`${todayBogota()}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function deadlineText(iso: string | null | undefined): string {
  const d = daysUntil(iso);
  if (d === null) return "Sin fecha";
  if (d < 0) return `Vencida hace ${-d} d`;
  if (d === 0) return "Vence hoy";
  if (d === 1) return "Vence mañana";
  return `En ${d} días`;
}

export function fmtDateTime(d: Date): string {
  return d.toLocaleString("es-CO", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
