import { describe, expect, it } from "vitest";
import { normPath, UsageBatch } from "../src/lib/usage";

describe("usage telemetry", () => {
  it("strips ids and query strings from paths", () => {
    expect(normPath("/clients/2895dc54-c072-4e9e-af07-9e3868401564?q=Andina")).toBe("/clients/:id");
    expect(normPath("/clients?q=maria")).toBe("/clients");
  });
  it("accepts small well-formed batches", () => {
    expect(UsageBatch.safeParse({ events: [{ event: "click", path: "/x", meta: { x: 10, y: 20, label: "btn:Agregar" } }] }).success).toBe(true);
  });
  it("rejects odd event names, big meta and oversized batches", () => {
    expect(UsageBatch.safeParse({ events: [{ event: "DROP TABLE;", path: "/x" }] }).success).toBe(false);
    expect(UsageBatch.safeParse({ events: [{ event: "click", path: "/x", meta: { label: "x".repeat(200) } }] }).success).toBe(false);
    expect(UsageBatch.safeParse({ events: Array.from({ length: 31 }, () => ({ event: "click", path: "/x" })) }).success).toBe(false);
  });
});
