/**
 * 決定的な疑似乱数（mulberry32）。
 * seed を固定すれば操作列を再現できる。外部 RNG ライブラリは使わない。
 */
export type Prng = {
  /** [0, 1) の浮動小数 */
  nextFloat: () => number;
  /** [0, max) の整数。max は正の整数 */
  nextInt: (max: number) => number;
};

function assertPositiveInt(max: number): void {
  if (!Number.isInteger(max) || max <= 0) {
    throw new RangeError(`nextInt max must be a positive integer, got ${String(max)}`);
  }
}

/**
 * 32-bit seed から決定的 PRNG を作る。
 * 参考: https://stackoverflow.com/questions/521295 (mulberry32)
 */
export function createPrng(seed: number): Prng {
  if (!Number.isFinite(seed)) {
    throw new RangeError(`seed must be a finite number, got ${String(seed)}`);
  }
  let state = seed >>> 0;

  const nextFloat = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const nextInt = (max: number): number => {
    assertPositiveInt(max);
    return Math.floor(nextFloat() * max);
  };

  return { nextFloat, nextInt };
}
