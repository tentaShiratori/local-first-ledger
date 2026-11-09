import { describe, expect, it } from "vite-plus/test";
import {
  createGCounter,
  equalsGCounter,
  incrementGCounter,
  mergeGCounter,
  valueGCounter,
  type GCounterState,
} from "./g-counter.js";
import { createPrng } from "./prng.js";

const A = "A";
const B = "B";
const C = "C";

function syncAll(
  a: GCounterState,
  b: GCounterState,
  c: GCounterState,
): {
  a: GCounterState;
  b: GCounterState;
  c: GCounterState;
} {
  const ab = mergeGCounter(a, b);
  const all = mergeGCounter(ab, c);
  return { a: all, b: all, c: all };
}

describe("G-Counter unit", () => {
  it("starts empty with value 0", () => {
    const s = createGCounter();
    expect(valueGCounter(s)).toBe(0);
    expect(equalsGCounter(s, {})).toBe(true);
  });

  it("increments only the caller's replica component", () => {
    let a = createGCounter();
    a = incrementGCounter(a, A, 3);
    a = incrementGCounter(a, A, 2);
    expect(a).toEqual({ A: 5 });
    expect(valueGCounter(a)).toBe(5);
  });

  it("rejects negative, non-integer, and non-finite amounts at the entry", () => {
    const s = createGCounter();
    expect(() => incrementGCounter(s, A, -1)).toThrow(RangeError);
    expect(() => incrementGCounter(s, A, 1.5)).toThrow(RangeError);
    expect(() => incrementGCounter(s, A, Number.NaN)).toThrow(RangeError);
    expect(() => incrementGCounter(s, A, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => incrementGCounter(s, "", 1)).toThrow(TypeError);
  });

  it("treats amount 0 as a no-op", () => {
    const s = incrementGCounter(createGCounter(), A, 1);
    expect(incrementGCounter(s, A, 0)).toBe(s);
  });

  it("merges by per-replica max, not by summing peer values", () => {
    const left = incrementGCounter(createGCounter(), A, 5);
    const right = incrementGCounter(createGCounter(), A, 3);
    // 同じレプリカ成分を加算すると二重計上になる。max なら 5。
    expect(mergeGCounter(left, right)).toEqual({ A: 5 });
    expect(valueGCounter(mergeGCounter(left, right))).toBe(5);
  });
});

describe("G-Counter acceptance (fixed scenarios)", () => {
  // 受け入れ 1: A/B/C が独立に更新できる
  it("allows independent updates on replicas A, B, and C", () => {
    let a = createGCounter();
    let b = createGCounter();
    let c = createGCounter();
    a = incrementGCounter(a, A, 1);
    b = incrementGCounter(b, B, 2);
    c = incrementGCounter(c, C, 3);
    expect(valueGCounter(a)).toBe(1);
    expect(valueGCounter(b)).toBe(2);
    expect(valueGCounter(c)).toBe(3);
    expect(a).toEqual({ A: 1 });
    expect(b).toEqual({ B: 2 });
    expect(c).toEqual({ C: 3 });
  });

  // 受け入れ 2: 全変更到達後に内部状態と読取値が一致
  it("converges internal state and values after all changes arrive", () => {
    let a = incrementGCounter(createGCounter(), A, 1);
    let b = incrementGCounter(createGCounter(), B, 2);
    let c = incrementGCounter(createGCounter(), C, 4);
    ({ a, b, c } = syncAll(a, b, c));
    expect(equalsGCounter(a, b)).toBe(true);
    expect(equalsGCounter(b, c)).toBe(true);
    expect(a).toEqual({ A: 1, B: 2, C: 4 });
    expect(valueGCounter(a)).toBe(7);
    expect(valueGCounter(b)).toBe(7);
    expect(valueGCounter(c)).toBe(7);
  });

  // 受け入れ 3: 配送順入れ替えでも最終一致
  it("converges regardless of delivery order", () => {
    const a0 = incrementGCounter(createGCounter(), A, 10);
    const b0 = incrementGCounter(createGCounter(), B, 20);
    const c0 = incrementGCounter(createGCounter(), C, 30);

    // 順: A←B←C
    const path1 = mergeGCounter(mergeGCounter(a0, b0), c0);
    // 順: C←A←B
    const path2 = mergeGCounter(mergeGCounter(c0, a0), b0);
    // 順: B←C←A
    const path3 = mergeGCounter(mergeGCounter(b0, c0), a0);

    expect(equalsGCounter(path1, path2)).toBe(true);
    expect(equalsGCounter(path2, path3)).toBe(true);
    expect(valueGCounter(path1)).toBe(60);
  });

  // 受け入れ 4: 重複配送で冪等
  it("is unchanged under duplicate delivery (idempotent merge)", () => {
    const a = incrementGCounter(createGCounter(), A, 5);
    const b = incrementGCounter(createGCounter(), B, 7);
    const once = mergeGCounter(a, b);
    const twice = mergeGCounter(once, b);
    const thrice = mergeGCounter(twice, a);
    expect(equalsGCounter(once, twice)).toBe(true);
    expect(equalsGCounter(twice, thrice)).toBe(true);
    expect(valueGCounter(thrice)).toBe(12);
  });

  // 受け入れ 5: 古い状態の遅延配送・分断後再同期
  it("converges after delayed old state and after partition healing", () => {
    let a = incrementGCounter(createGCounter(), A, 1);
    let b = incrementGCounter(createGCounter(), B, 1);
    // 分断: A と B だけ同期し、そのスナップショットを「古い状態」として残す
    const staleAb = mergeGCounter(a, b);
    a = mergeGCounter(a, b);
    b = mergeGCounter(b, a);

    // 分断中に追加更新
    a = incrementGCounter(a, A, 4);
    b = incrementGCounter(b, B, 9);
    let c = incrementGCounter(createGCounter(), C, 2);

    // 古い状態が遅延配送される
    a = mergeGCounter(a, staleAb);
    b = mergeGCounter(b, staleAb);
    expect(valueGCounter(a)).toBe(valueGCounter(mergeGCounter(staleAb, a)));

    // 分断解消: 全者同期
    ({ a, b, c } = syncAll(a, b, c));
    expect(equalsGCounter(a, b)).toBe(true);
    expect(equalsGCounter(b, c)).toBe(true);
    expect(a).toEqual({ A: 5, B: 10, C: 2 });
    expect(valueGCounter(a)).toBe(17);
  });
});

describe("G-Counter merge algebra (acceptance 6)", () => {
  const x = incrementGCounter(createGCounter(), A, 3);
  const y = incrementGCounter(createGCounter(), B, 5);
  const z = incrementGCounter(createGCounter(), C, 7);

  it("is commutative", () => {
    expect(equalsGCounter(mergeGCounter(x, y), mergeGCounter(y, x))).toBe(true);
  });

  it("is associative", () => {
    const left = mergeGCounter(mergeGCounter(x, y), z);
    const right = mergeGCounter(x, mergeGCounter(y, z));
    expect(equalsGCounter(left, right)).toBe(true);
  });

  it("is idempotent", () => {
    expect(equalsGCounter(mergeGCounter(x, x), x)).toBe(true);
  });
});

describe("G-Counter seeded random (acceptance 7)", () => {
  type Op =
    | { kind: "inc"; replica: typeof A | typeof B | typeof C; amount: number }
    | { kind: "merge"; from: 0 | 1 | 2; to: 0 | 1 | 2 };

  const TRIALS = 50;
  const BASE_SEED = 0xc0ffee;

  it("converges for seeded random operation sequences", () => {
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const seed = (BASE_SEED + trial) >>> 0;
      const rng = createPrng(seed);
      const replicas: GCounterState[] = [createGCounter(), createGCounter(), createGCounter()];
      const ids = [A, B, C] as const;
      const ops: Op[] = [];
      const opCount = 20 + rng.nextInt(20);

      for (let i = 0; i < opCount; i += 1) {
        if (rng.nextFloat() < 0.7) {
          const replicaIndex = rng.nextInt(3) as 0 | 1 | 2;
          const amount = 1 + rng.nextInt(5);
          const op: Op = { kind: "inc", replica: ids[replicaIndex], amount };
          ops.push(op);
          replicas[replicaIndex] = incrementGCounter(replicas[replicaIndex]!, op.replica, amount);
        } else {
          const from = rng.nextInt(3) as 0 | 1 | 2;
          let to = rng.nextInt(3) as 0 | 1 | 2;
          if (to === from) {
            to = ((to + 1) % 3) as 0 | 1 | 2;
          }
          ops.push({ kind: "merge", from, to });
          replicas[to] = mergeGCounter(replicas[to]!, replicas[from]!);
        }
      }

      // 最終的に全状態を交換（受け入れ 8: 途中一致は要求しない）
      const final = mergeGCounter(mergeGCounter(replicas[0]!, replicas[1]!), replicas[2]!);
      const check = (label: string, state: GCounterState) => {
        if (!equalsGCounter(state, final) || valueGCounter(state) !== valueGCounter(final)) {
          throw new Error(
            `G-Counter random divergence: seed=${seed} trial=${trial} at=${label} ops=${JSON.stringify(ops)} expected=${JSON.stringify(final)} got=${JSON.stringify(state)}`,
          );
        }
      };

      // 配送順を入れ替えても最終一致
      const orderings: Array<[GCounterState, GCounterState, GCounterState]> = [
        [replicas[0]!, replicas[1]!, replicas[2]!],
        [replicas[2]!, replicas[0]!, replicas[1]!],
        [replicas[1]!, replicas[2]!, replicas[0]!],
      ];
      for (const [p, q, r] of orderings) {
        const merged = mergeGCounter(mergeGCounter(p, q), r);
        check("ordering", merged);
      }

      // 重複 merge でも不変
      check("dup", mergeGCounter(final, replicas[0]!));
      check("dup2", mergeGCounter(final, final));
    }
  });
});
