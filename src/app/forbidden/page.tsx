import Link from "next/link";
import { Card } from "@/components/ui";

export default function Forbidden() {
  return (
    <Card title="Sin permiso" subtitle="Tu rol no tiene acceso a esta sección.">
      <Link href="/dashboard" className="text-brand hover:underline">Volver al inicio</Link>
    </Card>
  );
}
