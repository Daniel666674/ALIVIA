import { z } from "zod";
import { withTenant } from "@/db/client";
import { requirePermission } from "@/lib/auth/session";
import { portalModel } from "@/lib/portal";
import { PortalPreview } from "./portal-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portal del cliente · vista previa" };

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const s = await requirePermission("client:read");
  const c = z.string().uuid().safeParse((await searchParams).c);
  const { model, options } = await withTenant(s.user.firmId, (tx) => portalModel(tx, s.user.firmId, c.success ? c.data : null));
  return <PortalPreview key={model.clientId ?? "sample"} model={model} options={options} />;
}
