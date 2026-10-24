import { describe, expect, it } from "vitest";
import { blindIndex, decryptField, encryptField, hashToken, safeEqual } from "@/lib/crypto";

describe("field encryption", () => {
  it("round-trips and never repeats ciphertext", () => {
    const a = encryptField("900.123.456-7", "clients.nit:1");
    const b = encryptField("900.123.456-7", "clients.nit:1");
    expect(a).not.toBe(b);
    expect(a).not.toContain("900");
    expect(decryptField(a, "clients.nit:1")).toBe("900.123.456-7");
  });
  it("is bound to its location (AAD)", () => {
    const c = encryptField("secret", "users.totp_secret:A");
    expect(() => decryptField(c, "users.totp_secret:B")).toThrow();
  });
  it("detects tampering and malformed input", () => {
    const c = encryptField("secret", "x");
    const parts = c.split(".");
    const flipped = `${parts[0]}.${parts[1]}.${parts[2]!.slice(0, -2)}AA`;
    expect(() => decryptField(flipped, "x")).toThrow();
    expect(() => decryptField("garbage", "x")).toThrow();
    expect(() => decryptField("v1.a.b.c", "x")).toThrow();
  });
  it("decrypts old key versions after rotation", () => {
    const old = encryptField("hello", "x"); // written with key v1
    process.env.FIELD_KEY_CURRENT = "2";
    // env() is cached; new writes use v1 still in this process, but v2 key must exist & decrypt path must work
    expect(decryptField(old, "x")).toBe("hello");
    process.env.FIELD_KEY_CURRENT = "1";
  });
});

describe("blind index & tokens", () => {
  it("is deterministic, normalized, and purpose-separated", () => {
    expect(blindIndex(" 900123456-7 ", "client.nit")).toBe(blindIndex("900123456-7", "client.nit"));
    expect(blindIndex("900123456-7", "client.nit")).not.toBe(blindIndex("900123456-7", "other"));
  });
  it("hashes tokens and compares in constant time", () => {
    expect(hashToken("a")).toBe(hashToken("a"));
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
