import { InterestButton } from "@/components/interest-button";
import type { CatalogItem } from "@/lib/catalog";

const PHASE_TONE = { "Fase 2": "b-blue", "Fase 3": "b-amber", Futuro: "b-gray" } as const;

export function CatalogSection({ items }: { items: CatalogItem[] }) {
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <>
      {groups.map((g) => (
        <section key={g} className="mb-6">
          <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>{g}</h2>
          <div className="grid gap-3.5 lg:grid-cols-2">
            {items.filter((i) => i.group === g).map((i) => (
              <article key={i.id} className="card flex flex-col gap-3">
                <header className="flex items-start gap-2">
                  <h3 className="flex-1 text-[14.5px] font-semibold" style={{ color: "var(--t1)" }}>{i.name}</h3>
                  <span className={`badge ${PHASE_TONE[i.phase]}`}>{i.phase}</span>
                </header>
                <Block label="Qué hace">{i.what}</Block>
                <Block label="Cómo les ayuda">{i.helps}</Block>
                <div>
                  <Label>Hasta dónde puede crecer</Label>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px]" style={{ color: "var(--t2)" }}>{i.grows.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
                {i.revenue && <div className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--green-bg)", color: "var(--t2)" }}><b style={{ color: "var(--green)" }}>Oportunidad de ingreso: </b>{i.revenue}</div>}
                <div className="mt-auto flex justify-end"><InterestButton id={i.id} /></div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--t3)" }}>{children}</div>;
const Block = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div><Label>{label}</Label><p className="mt-1 text-[12.5px]" style={{ color: "var(--t2)" }}>{children}</p></div>
);
