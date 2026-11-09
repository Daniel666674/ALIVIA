"use client";

import { useState } from "react";
import { track } from "@/components/usage-tracker";

/** "Me interesa": a one-click demand signal. It is recorded in the usage log so the team can prioritize. */
export function InterestButton({ id }: { id: string }) {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      className={`btn btn-sm ${on ? "btn-secondary" : "btn-primary"}`}
      aria-pressed={on}
      onClick={() => {
        if (!on) track("interest", { topic: id });
        setOn(true);
      }}
    >
      {on ? "✓ Anotado" : "Me interesa"}
    </button>
  );
}
