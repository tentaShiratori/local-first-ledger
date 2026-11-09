import { describe, expect, it } from "vite-plus/test";
import { createPrng } from "./prng.js";
import {
  compareStamps,
  createLwwRegister,
  equalsLwwRegister,
  mergeLwwRegister,
  valueLwwRegister,
  writeLwwRegister,
  type LwwRegisterState,
} from "./lww-register.js";

const A = "A";
const B = "B";
const C = "C";

function syncAll<T>(
  a: LwwRegisterState<T>,
  b: LwwRegisterState<T>,
  c: LwwRegisterState<T>,
): {
  a: LwwRegisterState<T>;
  b: LwwRegisterState<T>;
  c: LwwRegisterState<T>;
} {
  const ab = mergeLwwRegister(a, b);
  const all = mergeLwwRegister(ab, c);
  return { a: all, b: all, c: all };
}

describe("LWW-Register unit", () => {
  it("creates with stamp (0, replicaId) and reads the initial value", () => {
    const s = createLwwRegister("init", A);
    expect(valueLwwRegister(s)).toBe("init");
    expect(s.stamp).toEqual({ counter: 0, replicaId: A });
  });

  it("writes with a counter strictly greater than the observed max", () => {
    let s = createLwwRegister("v0", A);
    s = writeLwwRegister(s, "v1", A);
    expect(s.stamp.counter).toBe(1);
    s = writeLwwRegister(s, "v2", B);
    expect(s.stamp).toEqual({ counter: 2, replicaId: B });
    expect(valueLwwRegister(s)).toBe("v2");
  });

  it("rejects empty replica ids", () => {
    expect(() => createLwwRegister("x", "")).toThrow(TypeError);
    const s = createLwwRegister("x", A);
    expect(() => writeLwwRegister(s, "y", "")).toThrow(TypeError);
  });

  it("compares stamps by counter first, then replica id", () => {
    expect(compareStamps({ counter: 1, replicaId: A }, { counter: 2, replicaId: B })).toBeLessThan(
      0,
    );
    expect(compareStamps({ counter: 2, replicaId: A }, { counter: 2, replicaId: B })).toBeLessThan(
      0,
    );
    expect(
      compareStamps({ counter: 2, replicaId: B }, { counter: 2, replicaId: A }),
    ).toBeGreaterThan(0);
    expect(compareStamps({ counter: 3, replicaId: A }, { counter: 3, replicaId: A })).toBe(0);
  });

  it("keeps only one value on conflict (deterministic stamp winner, not wall-clock)", () => {
    // 同値カウンタでレプリカ ID が大きい方が勝つ。実時間の前後は関係ない。
    const fromA = writeLwwRegister(createLwwRegister("base", A), "from-A", A);
    const fromB = writeLwwRegister(createLwwRegister("base", B), "from-B", B);
    expect(fromA.stamp.counter).toBe(1);
    expect(fromB.stamp.counter).toBe(1);
    const merged = mergeLwwRegister(fromA, fromB);
    expect(valueLwwRegister(merged)).toBe("from-B");
    expect(merged.stamp).toEqual({ counter: 1, replicaId: B });
  });
});

describe("LWW-Register acceptance (fixed scenarios)", () => {
  // 受け入れ 1
  it("allows independent updates on replicas A, B, and C", () => {
    let a = createLwwRegister("start", A);
    let b = createLwwRegister("start", B);
    let c = createLwwRegister("start", C);
    a = writeLwwRegister(a, "a1", A);
    b = writeLwwRegister(b, "b1", B);
    c = writeLwwRegister(c, "c1", C);
    expect(valueLwwRegister(a)).toBe("a1");
    expect(valueLwwRegister(b)).toBe("b1");
    expect(valueLwwRegister(c)).toBe("c1");
  });

  // 受け入れ 2
  it("converges internal state and values after all changes arrive", () => {
    let a = writeLwwRegister(createLwwRegister("s", A), "a", A);
    let b = writeLwwRegister(createLwwRegister("s", B), "b", B);
    let c = writeLwwRegister(createLwwRegister("s", C), "c", C);
    // カウンタはすべて 1。勝者はレプリカ ID 最大の C。
    ({ a, b, c } = syncAll(a, b, c));
    expect(equalsLwwRegister(a, b)).toBe(true);
    expect(equalsLwwRegister(b, c)).toBe(true);
    expect(valueLwwRegister(a)).toBe("c");
    expect(a.stamp).toEqual({ counter: 1, replicaId: C });
  });

  // 受け入れ 3
  it("converges regardless of delivery order", () => {
    const a0 = writeLwwRegister(createLwwRegister("s", A), "a", A);
    const b0 = writeLwwRegister(createLwwRegister("s", B), "b", B);
    const c0 = writeLwwRegister(createLwwRegister("s", C), "c", C);

    const path1 = mergeLwwRegister(mergeLwwRegister(a0, b0), c0);
    const path2 = mergeLwwRegister(mergeLwwRegister(c0, a0), b0);
    const path3 = mergeLwwRegister(mergeLwwRegister(b0, c0), a0);

    expect(equalsLwwRegister(path1, path2)).toBe(true);
    expect(equalsLwwRegister(path2, path3)).toBe(true);
    expect(valueLwwRegister(path1)).toBe("c");
  });

  // 受け入れ 4
  it("is unchanged under duplicate delivery (idempotent merge)", () => {
    const a = writeLwwRegister(createLwwRegister("s", A), "a", A);
    const b = writeLwwRegister(createLwwRegister("s", B), "b", B);
    const once = mergeLwwRegister(a, b);
    const twice = mergeLwwRegister(once, b);
    const thrice = mergeLwwRegister(twice, a);
    expect(equalsLwwRegister(once, twice)).toBe(true);
    expect(equalsLwwRegister(twice, thrice)).toBe(true);
  });

  // 受け入れ 5
  it("converges after delayed old state and after partition healing", () => {
    let a = writeLwwRegister(createLwwRegister("s", A), "a1", A);
    let b = writeLwwRegister(createLwwRegister("s", B), "b1", B);
    // いったん A/B だけ同期し、その結果を「古い状態」として残す
    const synced = mergeLwwRegister(a, b);
    const stale = synced;
    a = synced;
    b = synced;

    // 分断中に、共通の観測済みカウンタから並行書込み
    a = writeLwwRegister(a, "a2", A);
    b = writeLwwRegister(b, "b2", B);
    let c = writeLwwRegister(createLwwRegister("s", C), "c1", C);

    // 古い状態の遅延配送
    a = mergeLwwRegister(a, stale);
    b = mergeLwwRegister(b, stale);

    ({ a, b, c } = syncAll(a, b, c));
    expect(equalsLwwRegister(a, b)).toBe(true);
    expect(equalsLwwRegister(b, c)).toBe(true);
    // a2 / b2 はカウンタ 2。tie-break で B が勝つ。c1 はカウンタ 1 で負ける。
    expect(valueLwwRegister(a)).toBe("b2");
    expect(a.stamp.counter).toBe(2);
    expect(a.stamp.replicaId).toBe(B);
  });

  it("never reuses a stamp: post-merge write exceeds observed max counter", () => {
    const a = writeLwwRegister(createLwwRegister("s", A), "a", A);
    const b = writeLwwRegister(createLwwRegister("s", B), "b", B);
    const merged = mergeLwwRegister(a, b);
    expect(merged.stamp.counter).toBe(1);
    const next = writeLwwRegister(merged, "next", A);
    expect(next.stamp.counter).toBe(2);
    expect(next.stamp.replicaId).toBe(A);
    expect(valueLwwRegister(next)).toBe("next");
  });
});

describe("LWW-Register merge algebra (acceptance 6)", () => {
  const x = writeLwwRegister(createLwwRegister("s", A), "x", A);
  const y = writeLwwRegister(createLwwRegister("s", B), "y", B);
  const z = writeLwwRegister(createLwwRegister("s", C), "z", C);

  it("is commutative", () => {
    expect(equalsLwwRegister(mergeLwwRegister(x, y), mergeLwwRegister(y, x))).toBe(true);
  });

  it("is associative", () => {
    const left = mergeLwwRegister(mergeLwwRegister(x, y), z);
    const right = mergeLwwRegister(x, mergeLwwRegister(y, z));
    expect(equalsLwwRegister(left, right)).toBe(true);
  });

  it("is idempotent", () => {
    expect(equalsLwwRegister(mergeLwwRegister(x, x), x)).toBe(true);
  });
});

describe("LWW-Register seeded random (acceptance 7)", () => {
  type Op =
    | { kind: "write"; replica: typeof A | typeof B | typeof C; value: string }
    | { kind: "merge"; from: 0 | 1 | 2; to: 0 | 1 | 2 };

  const TRIALS = 50;
  const BASE_SEED = 0xbadc0de;

  it("converges for seeded random operation sequences", () => {
    for (let trial = 0; trial < TRIALS; trial += 1) {
      const seed = (BASE_SEED + trial) >>> 0;
      const rng = createPrng(seed);
      const ids = [A, B, C] as const;
      const replicas: LwwRegisterState<string>[] = [
        createLwwRegister("s", A),
        createLwwRegister("s", B),
        createLwwRegister("s", C),
      ];
      const ops: Op[] = [];
      const opCount = 20 + rng.nextInt(20);

      for (let i = 0; i < opCount; i += 1) {
        if (rng.nextFloat() < 0.65) {
          const replicaIndex = rng.nextInt(3) as 0 | 1 | 2;
          const value = `v-${trial}-${i}-${rng.nextInt(1000)}`;
          const op: Op = { kind: "write", replica: ids[replicaIndex], value };
          ops.push(op);
          replicas[replicaIndex] = writeLwwRegister(replicas[replicaIndex]!, value, op.replica);
        } else {
          const from = rng.nextInt(3) as 0 | 1 | 2;
          let to = rng.nextInt(3) as 0 | 1 | 2;
          if (to === from) {
            to = ((to + 1) % 3) as 0 | 1 | 2;
          }
          ops.push({ kind: "merge", from, to });
          replicas[to] = mergeLwwRegister(replicas[to]!, replicas[from]!);
        }
      }

      const final = mergeLwwRegister(mergeLwwRegister(replicas[0]!, replicas[1]!), replicas[2]!);

      const check = (label: string, state: LwwRegisterState<string>) => {
        if (!equalsLwwRegister(state, final)) {
          throw new Error(
            `LWW random divergence: seed=${seed} trial=${trial} at=${label} ops=${JSON.stringify(ops)} expected=${JSON.stringify(final)} got=${JSON.stringify(state)}`,
          );
        }
      };

      const orderings: Array<
        [LwwRegisterState<string>, LwwRegisterState<string>, LwwRegisterState<string>]
      > = [
        [replicas[0]!, replicas[1]!, replicas[2]!],
        [replicas[2]!, replicas[0]!, replicas[1]!],
        [replicas[1]!, replicas[2]!, replicas[0]!],
      ];
      for (const [p, q, r] of orderings) {
        check("ordering", mergeLwwRegister(mergeLwwRegister(p, q), r));
      }
      check("dup", mergeLwwRegister(final, replicas[1]!));
      check("dup2", mergeLwwRegister(final, final));
    }
  });
});
