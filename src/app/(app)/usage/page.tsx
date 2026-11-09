import { and, eq, notInArray, sql } from "drizzle-orm";
import { env } from "@/env";
import { withTenant } from "@/db/client";
import { auditLog, usageEvents, users } from "@/db/schema";
import { Avatar, PageHeader, Stat } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { AUTOMATIONS, INTEGRATIONS } from "@/lib/catalog";
import { KNOWN_PAGES } from "@/lib/usage";
import { fmtDateTime, timeAgo } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("es-CO");
const label = sql<string>`coalesce(meta->>'label','?')`;

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ p?: string; d?: string }> }) {
  const s = await requirePermission("user:manage");
  const q = await searchParams;
  const days = [7, 30, 90].includes(Number(q.d)) ? Number(q.d) : 30;
  const f = s.user.firmId;

  const excludedEmails = env().USAGE_EXCLUDE_EMAILS;
  const d = await withTenant(f, async (tx) => {
    // Developers (USAGE_EXCLUDE_EMAILS) never count, including events recorded before they were excluded.
    const excluded = excludedEmails.length ? (await tx.select({ id: users.id }).from(users).where(and(eq(users.firmId, f), sql`lower(${users.email}) in (${sql.join(excludedEmails.map((e) => sql`${e}`), sql`, `)})`))).map((u) => u.id) : [];
    const base = and(eq(usageEvents.firmId, f), sql`${usageEvents.at} >= now() - make_interval(days => ${days})`, ...(excluded.length ? [notInArray(usageEvents.userId, excluded)] : []));
    const totals = (
      await tx
        .select({
          events: sql<number>`count(*)::int`,
          people: sql<number>`count(distinct ${usageEvents.userId})::int`,
          views: sql<number>`count(*) filter (where ${usageEvents.event} = 'page.view')::int`,
          clicks: sql<number>`count(*) filter (where ${usageEvents.event} = 'click')::int`,
          rage: sql<number>`count(*) filter (where ${usageEvents.event} = 'rage_click')::int`,
        })
        .from(usageEvents)
        .where(base)
    )[0]!;
    const pages = await tx
      .select({ path: usageEvents.path, views: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "page.view")))
      .groupBy(usageEvents.path)
      .orderBy(sql`count(*) desc`);
    const features = await tx
      .select({ label, n: sql<number>`count(*)::int`, people: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "click"), sql`meta->>'label' like 'wa.%' or meta->>'label' like 'btn:%'`))
      .groupBy(label)
      .orderBy(sql`count(*) desc`)
      .limit(15);
    const interest = await tx
      .select({ topic: sql<string>`coalesce(meta->>'topic','?')`, n: sql<number>`count(distinct ${usageEvents.userId})::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "interest")))
      .groupBy(sql`meta->>'topic'`)
      .orderBy(sql`count(distinct ${usageEvents.userId}) desc`);
    const help = await tx
      .select({ topic: sql<string>`coalesce(meta->>'topic','?')`, n: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "help.open")))
      .groupBy(sql`meta->>'topic'`)
      .orderBy(sql`count(*) desc`)
      .limit(10);
    const friction = await tx
      .select({ path: usageEvents.path, label, n: sql<number>`count(*)::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "rage_click")))
      .groupBy(usageEvents.path, label)
      .orderBy(sql`count(*) desc`)
      .limit(8);
    const perUser = await tx
      .select({
        id: users.id,
        name: users.name,
        first: sql<Date>`min(${usageEvents.at})`,
        last: sql<Date>`max(${usageEvents.at})`,
        views: sql<number>`count(*) filter (where ${usageEvents.event} = 'page.view')::int`,
        clicks: sql<number>`count(*) filter (where ${usageEvents.event} = 'click')::int`,
        pagesSeen: sql<number>`count(distinct ${usageEvents.path}) filter (where ${usageEvents.event} = 'page.view')::int`,
      })
      .from(usageEvents)
      .innerJoin(users, eq(users.id, usageEvents.userId))
      .where(base)
      .groupBy(users.id, users.name)
      .orderBy(sql`count(*) desc`);
    const imports = await tx
      .select({ userId: auditLog.userId, at: sql<Date>`min(${auditLog.at})` })
      .from(auditLog)
      .where(and(eq(auditLog.firmId, f), eq(auditLog.action, "import.applied")))
      .groupBy(auditLog.userId);
    const daily = await tx
      .select({ day: sql<string>`to_char(${usageEvents.at} at time zone 'America/Bogota','MM-DD')`, n: sql<number>`count(*) filter (where ${usageEvents.event} = 'page.view')::int` })
      .from(usageEvents)
      .where(base)
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const heatPath = q.p && KNOWN_PAGES[q.p] ? q.p : pages[0]?.path ?? "/dashboard";
    const dots = await tx
      .select({ x: sql<number>`(meta->>'x')::int`, y: sql<number>`(meta->>'y')::int` })
      .from(usageEvents)
      .where(and(base, eq(usageEvents.event, "click"), eq(usageEvents.path, heatPath), sql`(meta->>'vw')::int = 1`, sql`meta ? 'x' and meta ? 'y'`))
      .limit(3000);
    return { totals, pages, features, interest, help, friction, perUser, imports, daily, heatPath, dots };
  });

  const seen = new Set(d.pages.map((p) => p.path));
  const never = Object.entries(KNOWN_PAGES).filter(([p]) => !seen.has(p));
  const importAt = new Map(d.imports.map((i) => [i.userId, new Date(i.at)]));
  const maxDay = Math.max(1, ...d.daily.map((x) => x.n));
  const heatH = Math.min(2400, Math.max(600, ...d.dots.map((x) => x.y + 80)));
  const scale = 0.4;
  const mins = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

  return (
    <Shell session={s} active="/usage">
      <PageHeader
        title="Uso del demo"
        subtitle={`Qué hace el equipo dentro de Alivia · últimos ${days} días · no se guarda ningún dato de clientes`}
        actions={[7, 30, 90].map((n) => (
          <Link key={n} href={`/usage?d=${n}`} className={`btn btn-sm ${n === days ? "btn-primary" : "btn-secondary"}`}>{n} días</Link>
        ))}
      />

      <div className="mb-5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon="team" iconBg="#EDE9FE" iconColor="#4F46E5" label="Personas activas" value={d.totals.people} hint="· con al menos una visita" />
        <Stat icon="dashboard" iconBg="#CCFBF1" iconColor="#0D9488" label="Páginas vistas" value={num(d.totals.views)} hint="· en total" />
        <Stat icon="bolt" iconBg="#FEF3C7" iconColor="#F79009" label="Clics" value={num(d.totals.clicks)} hint="· interacciones" />
        <Stat icon="alert" iconBg="#FEE2E2" iconColor="#F04438" label="Clics de frustración" value={d.totals.rage} hint={d.totals.rage ? "↓ Revisar abajo" : "· Sin fricción visible"} hintTone={d.totals.rage ? "down" : "neutral"} />
        <Stat icon="file" iconBg="#F5F3FF" iconColor="#7C3AED" label="Páginas sin visitar" value={never.length} hint={never.length ? "· Posible falta de interés o de guía" : "· Recorrieron todo"} />
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <section className="card">
          <div className="sec-hd"><div><h2 className="sec-title">Páginas más visitadas</h2><p className="sec-sub">Dónde pasan el tiempo</p></div></div>
          {d.pages.length === 0 && <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>Todavía no hay datos. Navegue por el sistema y vuelva en unos segundos.</p>}
          {d.pages.map((p) => (
            <div key={p.path} className="wl-row">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold" style={{ color: "var(--t1)" }}>{KNOWN_PAGES[p.path] ?? p.path}</div>
                <div className="text-[11px]" style={{ color: "var(--t3)" }}>{p.views} visitas · {p.people} persona{p.people === 1 ? "" : "s"}</div>
              </div>
              <div className="prog w-[120px]"><div className="prog-fill" style={{ width: `${Math.round((p.views / d.pages[0]!.views) * 100)}%`, background: "var(--brand)" }} /></div>
            </div>
          ))}
          {never.length > 0 && <p className="mt-3 text-[12px]" style={{ color: "var(--t3)" }}><b>Nadie ha abierto:</b> {never.map(([, n]) => n).join(", ")}</p>}
        </section>

        <section className="card">
          <div className="sec-hd"><div><h2 className="sec-title">Qué botones usan</h2><p className="sec-sub">Acciones con más clics (WhatsApp, marcar, agregar…)</p></div></div>
          {d.features.length === 0 && <p className="py-6 text-center text-[13px]" style={{ color: "var(--t3)" }}>Sin datos todavía.</p>}
          {d.features.map((x) => (
            <div key={x.label} className="wl-row">
              <div className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: "var(--t1)" }}>{x.label.replace("btn:", "")}</div>
              <span className="badge b-gray">{x.n} clics · {x.people} p.</span>
            </div>
          ))}
          <h3 className="mt-4 mb-1 text-[12px] font-semibold uppercase" style={{ color: "var(--t3)" }}>Ayudas (i) abiertas — lo que genera dudas</h3>
          {d.help.length === 0 ? <p className="text-[12px]" style={{ color: "var(--t3)" }}>Nadie ha abierto una ayuda todavía.</p> : d.help.map((h) => (
            <div key={h.topic} className="flex justify-between py-1 text-[13px]"><span>{h.topic}</span><b>{h.n}</b></div>
          ))}
        </section>
      </div>

      <section className="card mb-4">
        <div className="sec-hd"><div><h2 className="sec-title">Interés en automatizaciones e integraciones</h2><p className="sec-sub">Lo que marcaron «Me interesa»: así decide qué construir primero</p></div></div>
        {d.interest.length === 0 ? <p className="py-3 text-[13px]" style={{ color: "var(--t3)" }}>Todavía nadie ha marcado interés.</p> : (
          <div className="flex flex-wrap gap-2">
            {d.interest.map((x) => <span key={x.topic} className="badge b-blue">{[...AUTOMATIONS, ...INTEGRATIONS].find((i) => i.id === x.topic)?.name ?? x.topic} · {x.n} p.</span>)}
          </div>
        )}
      </section>

      <div className="mb-4 grid gap-4 xl:grid-cols-[3fr_2fr]">
        <section className="card">
          <div className="sec-hd"><div><h2 className="sec-title">Por persona</h2><p className="sec-sub">Adopción y tiempo hasta la primera importación</p></div></div>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Persona</th><th>Última vez</th><th>Visitas</th><th>Clics</th><th>Páginas distintas</th><th>Hasta 1.ª importación</th></tr></thead>
            <tbody>
              {d.perUser.map((u) => {
                const imp = importAt.get(u.id);
                return (
                  <tr key={u.id}>
                    <td><span className="flex items-center gap-2"><Avatar name={u.name} size={26} />{u.name}</span></td>
                    <td title={fmtDateTime(new Date(u.last))}>{timeAgo(new Date(u.last))}</td>
                    <td>{u.views}</td><td>{u.clicks}</td><td>{u.pagesSeen} de {Object.keys(KNOWN_PAGES).length}</td>
                    <td>{imp ? `${mins(new Date(u.first), imp)} min` : "—"}</td>
                  </tr>
                );
              })}
              {d.perUser.length === 0 && <tr><td colSpan={6} style={{ color: "var(--t3)" }}>Sin datos todavía.</td></tr>}
            </tbody>
          </table></div>
        </section>

        <section className="card">
          <div className="sec-hd"><div><h2 className="sec-title">Donde se atascan</h2><p className="sec-sub">Clics repetidos rápido sobre lo mismo</p></div></div>
          {d.friction.length === 0 && <p className="py-4 text-center text-[13px]" style={{ color: "var(--t3)" }}>Sin señales de frustración. 👍</p>}
          {d.friction.map((x, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-[13px]"><span>{KNOWN_PAGES[x.path] ?? x.path} → <code>{x.label}</code></span><span className="badge b-red">{x.n}×</span></div>
          ))}
          <h3 className="mt-4 mb-2 text-[12px] font-semibold uppercase" style={{ color: "var(--t3)" }}>Visitas por día</h3>
          <div className="flex h-20 items-end gap-1">
            {d.daily.map((x) => <div key={x.day} title={`${x.day}: ${x.n}`} className="flex-1 rounded-t" style={{ height: `${Math.max(6, (x.n / maxDay) * 100)}%`, background: "var(--brand)" }} />)}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="sec-hd">
          <div><h2 className="sec-title">Mapa de calor de clics</h2><p className="sec-sub">{d.dots.length} clics de escritorio en «{KNOWN_PAGES[d.heatPath] ?? d.heatPath}» · lo más rojo es lo más tocado</p></div>
        </div>
        <div className="f-tabs mb-3">
          {Object.entries(KNOWN_PAGES).map(([p, n]) => <Link key={p} href={`/usage?d=${days}&p=${encodeURIComponent(p)}`} className={`f-tab ${p === d.heatPath ? "active" : ""}`}>{n}</Link>)}
        </div>
        <div className="relative w-full overflow-hidden rounded-lg border" style={{ height: heatH * scale, background: "var(--ws-bg)", borderColor: "var(--ws-border)" }} role="img" aria-label="Mapa de calor de clics">
          {d.dots.map((c, i) => (
            <span key={i} className="absolute rounded-full" style={{ left: `${c.x / 10}%`, top: c.y * scale, width: 36, height: 36, marginLeft: -18, marginTop: -18, background: "radial-gradient(circle, rgba(240,68,56,.45) 0%, rgba(240,68,56,0) 70%)" }} />
          ))}
        </div>
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--t3)" }}>Eje horizontal = ancho de la pantalla; vertical = posición en la página (reducida al 40%).</p>
      </section>
    </Shell>
  );
}
