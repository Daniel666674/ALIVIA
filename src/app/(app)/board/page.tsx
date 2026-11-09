import Link from "next/link";
import { withTenant } from "@/db/client";
import { Dot, PageHeader } from "@/components/app-ui";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/auth/session";
import { boardData, firmUsers } from "@/lib/clients/service";
import { COLOR_LABEL, type Color } from "@/lib/clients/semaforo";
import { deadlineText } from "@/lib/format";

export const dynamic = "force-dynamic";

const COLUMNS: { color: Color; stage?: string }[] = [{ color: "red" }, { color: "yellow" }, { color: "blue" }, { color: "green" }];
const CARD_BORDER: Record<Color, string> = { red: "border-l-red-500", yellow: "border-l-amber-400", blue: "border-l-sky-500", green: "border-l-emerald-500" };
const PER_COLUMN = 25;

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requirePermission("client:read");
  const raw = await searchParams;
  const { rows, people } = await withTenant(s.user.firmId, async (tx) => {
    const people = await firmUsers(tx, s.user.firmId);
    const filter = people.find((p) => p.id === raw.who)?.id;
    return { rows: await boardData(tx, s.user.firmId, filter), people };
  });
  const who = people.find((p) => p.id === raw.who)?.id;
  return (
    <Shell session={s} active="/board">
      <PageHeader
        title="Avance de todos los clientes"
        subtitle="Cada tarjeta tiene el color de su estado"
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href="/board" className={`rounded-full border px-3 py-1 ${!who ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}>Todos</Link>
            {people.map((p) => (
              <Link key={p.id} href={`/board?who=${p.id}`} className={`rounded-full border px-3 py-1 ${who === p.id ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`}>{p.name.split(" ")[0]}</Link>
            ))}
          </div>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map(({ color }) => {
          const col = rows.filter((r) => r.color === color);
          return (
            <section key={color} className="rounded-2xl bg-slate-100 p-3" aria-label={COLOR_LABEL[color]}>
              <h2 className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <Dot color={color} size="h-2.5 w-2.5" /> {COLOR_LABEL[color]} <span className="ml-auto text-slate-900">{col.length}</span>
              </h2>
              <ul className="space-y-2">
                {col.slice(0, PER_COLUMN).map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${c.id}`} className={`block rounded-xl border border-slate-200 border-l-4 bg-white p-3 text-sm shadow-sm hover:shadow ${CARD_BORDER[color]}`}>
                      <span className="block font-semibold">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.received}/4 docs · {deadlineText(c.deadline)}{c.responsibleName ? ` · ${c.responsibleName.split(" ")[0]}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {col.length > PER_COLUMN && <Link href="/clients" className="mt-2 block px-1 text-xs font-semibold text-brand hover:underline">+{col.length - PER_COLUMN} más en la lista</Link>}
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
