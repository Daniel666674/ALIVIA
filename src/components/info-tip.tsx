"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { HelpEntry } from "@/lib/help";

/**
 * The little (i): hover, focus or click to learn "what am I looking at" and "how do I use it".
 * Keyboard and touch friendly (click toggles, Escape / outside click closes).
 */
export function InfoTip({ entry, align = "left" }: { entry: HelpEntry; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  const visible = open || pinned;

  useEffect(() => {
    if (!pinned) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span ref={root} className="info-tip" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="info-btn"
        aria-label={`Ayuda: ${entry.title}`}
        aria-expanded={visible}
        aria-controls={id}
        onClick={() => setPinned((p) => !p)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        i
      </button>
      {visible && (
        <span id={id} role="tooltip" className={`info-pop ${align === "right" ? "right" : ""}`}>
          <span className="info-title">{entry.title}</span>
          <span className="info-label">Qué está viendo</span>
          <span className="info-text">{entry.see}</span>
          <span className="info-label">Cómo usarlo</span>
          <ul className="info-list">
            {entry.use.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </span>
      )}
    </span>
  );
}
