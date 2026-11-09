import { describe, expect, it } from "vite-plus/test";
import { createPrng } from "./prng.js";

describe("createPrng", () => {
  it("is deterministic for the same seed", () => {
    const a = createPrng(42);
    const b = createPrng(42);
    const seqA = [a.nextFloat(), a.nextInt(10), a.nextFloat(), a.nextInt(100)];
    const seqB = [b.nextFloat(), b.nextInt(10), b.nextFloat(), b.nextInt(100)];
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = createPrng(1);
    const b = createPrng(2);
    expect(a.nextFloat()).not.toBe(b.nextFloat());
  });

  it("rejects non-finite seeds and non-positive nextInt max", () => {
    expect(() => createPrng(Number.NaN)).toThrow(RangeError);
    const rng = createPrng(0);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-3)).toThrow(RangeError);
    expect(() => rng.nextInt(1.5)).toThrow(RangeError);
  });
});
