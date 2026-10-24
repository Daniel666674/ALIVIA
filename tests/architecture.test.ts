import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(import.meta.dirname, "../src");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? (f === "migrations" ? [] : walk(p)) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const files = walk(SRC).map((p) => ({ rel: path.relative(SRC, p), text: readFileSync(p, "utf8") }));

describe("security architecture guards", () => {
  it("never uses sql.raw or dangerouslySetInnerHTML", () => {
    const bad = files.filter((f) => /sql\.raw\(|dangerouslySetInnerHTML/.test(f.text)).map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("cross-tenant withSystem() is confined to the auth layer", () => {
    const allowed = [/^lib\/auth\//, /^app\/login\/actions\.ts$/, /^db\/client\.ts$/];
    const bad = files
      .filter((f) => /\bwithSystem\(/.test(f.text) && !allowed.some((re) => re.test(f.rel)))
      .map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it("no module outside db/ opens its own database connection", () => {
    const bad = files.filter((f) => /new Pool\(|from "pg"/.test(f.text) && f.rel !== "db/client.ts").map((f) => f.rel);
    expect(bad).toEqual([]);
  });

  it('"use server" files only export async functions (every export is a public endpoint)', () => {
    const bad: string[] = [];
    for (const f of files.filter((x) => /^\s*["']use server["']/.test(x.text))) {
      for (const m of f.text.matchAll(/^export\s+(?!async function)(.*)$/gm)) bad.push(`${f.rel}: ${m[0]}`);
    }
    expect(bad).toEqual([]);
  });

  it("every server action re-checks the session itself", () => {
    const publicActions = new Set(["loginAction"]);
    const missing: string[] = [];
    for (const f of files.filter((x) => /^\s*["']use server["']/.test(x.text))) {
      for (const m of f.text.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)) {
        const [, name, body] = m;
        if (publicActions.has(name!)) continue;
        if (!/getSession\(|requireUser\(|requirePermission\(/.test(body!)) missing.push(`${f.rel}:${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
