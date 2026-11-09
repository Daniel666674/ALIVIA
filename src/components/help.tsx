import { InfoTip } from "@/components/info-tip";
import { HELP } from "@/lib/help";

/** <Help id="nba" /> renders the (i) for an entry of lib/help.ts. */
export function Help({ id, align }: { id: keyof typeof HELP; align?: "left" | "right" }) {
  return <InfoTip entry={HELP[id]!} align={align} />;
}
