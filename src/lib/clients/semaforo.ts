export type Color = "red" | "yellow" | "blue" | "green";
export type Stage = "pending" | "in_preparation" | "in_review" | "presented";

/**
 * Traffic-light state of a client:
 *  green  = declaration presented
 *  blue   = being prepared / reviewed, or all 4 documents received
 *  yellow = some documents received
 *  red    = no documents yet
 */
export function colorFor(stage: Stage, docsReceived: number): Color {
  if (stage === "presented") return "green";
  if (stage === "in_preparation" || stage === "in_review") return "blue";
  if (docsReceived >= 4) return "blue";
  if (docsReceived >= 1) return "yellow";
  return "red";
}

export const COLOR_LABEL: Record<Color, string> = {
  red: "Sin documentos",
  yellow: "Documentos parciales",
  blue: "En preparación",
  green: "Presentada",
};

export const STAGE_LABEL: Record<Stage, string> = {
  pending: "Sin presentar",
  in_preparation: "En preparación",
  in_review: "En revisión",
  presented: "Presentada",
};

export const DOC_LABEL = {
  bank_cert: "Certificación bancaria",
  rut: "RUT",
  dian_key: "Clave DIAN",
  id_doc: "Documentos de cédula",
} as const;
