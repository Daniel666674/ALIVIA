"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

type Ev = { event: string; path: string; meta?: Record<string, string | number | boolean> };
let queue: Ev[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const clean = (p: string) => p.split(/[?#]/)[0]!.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");

function flush() {
  timer = null;
  if (!queue.length) return;
  const events = queue.splice(0, 30);
  try {
    void fetch("/api/usage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }), keepalive: true });
  } catch {}
  if (queue.length) timer = setTimeout(flush, 500);
}

/** Queue an event (batched, fire-and-forget). Never pass client names or any personal data. */
export function track(event: string, meta?: Ev["meta"]) {
  queue.push({ event, path: clean(location.pathname), meta });
  if (!timer) timer = setTimeout(flush, 4000);
}

/** Records page views, click positions (for heatmaps), rage clicks and anything marked with data-track. */
export function UsageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    track("page.view");
  }, [pathname]);

  useEffect(() => {
    let last: { t: number; x: number; y: number; n: number } | null = null;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track],a,button,input,select,textarea,summary");
      const tagged = el?.closest<HTMLElement>("[data-track]")?.dataset.track;
      let label = tagged ?? (el?.getAttribute("aria-label") ?? "").slice(0, 40);
      if (!label && el?.tagName === "A") label = `link:${clean(new URL((el as HTMLAnchorElement).href, location.href).pathname)}`;
      if (!label && el?.tagName === "BUTTON") label = `btn:${(el.textContent ?? "").trim().slice(0, 30)}`;
      if (!label) label = el ? el.tagName.toLowerCase() : "page";
      const doc = document.documentElement;
      track("click", { x: Math.round((e.pageX / Math.max(doc.clientWidth, 1)) * 1000), y: Math.round(e.pageY), vw: doc.clientWidth < 768 ? 0 : 1, label });
      const now = Date.now();
      if (last && now - last.t < 700 && Math.hypot(e.pageX - last.x, e.pageY - last.y) < 30) {
        last.n += 1;
        last.t = now;
        if (last.n === 3) track("rage_click", { label });
      } else last = { t: now, x: e.pageX, y: e.pageY, n: 1 };
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return null;
}
