import type { ReplicaId } from "./g-counter.js";

/**
 * 後勝ちレジスタ（LWW-Register 相当）。
 *
 * 状態は value と stamp `(論理カウンタ, レプリカID)`。
 * 勝者は stamp の辞書順最大（カウンタ優先、同値ならレプリカ ID）。
 *
 * 注意（学習用）:
 * これは壁時計の「実時間の最後の書込み」を保証しない。
 * 決定的な順序で片方の value だけを残す仕組みである。
 * 競合時にもう一方の値は失われる（両方を残す方式ではない）。
 */

export type Stamp = {
  readonly counter: number;
  readonly replicaId: ReplicaId;
};

export type LwwRegisterState<T> = {
  readonly value: T;
  readonly stamp: Stamp;
};

function assertReplicaId(replicaId: string): asserts replicaId is ReplicaId {
  if (typeof replicaId !== "string" || replicaId.length === 0) {
    throw new TypeError(`replicaId must be a non-empty string, got ${String(replicaId)}`);
  }
}

function assertNonNegativeInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(n)) {
    throw new RangeError(`${label} must be a non-negative finite integer, got ${String(n)}`);
  }
}

function assertStamp(stamp: Stamp): void {
  assertNonNegativeInt(stamp.counter, "stamp.counter");
  assertReplicaId(stamp.replicaId);
}

/**
 * stamp の比較。正なら a が勝ち、負なら b が勝ち、0 なら同一 stamp。
 * 論理カウンタ優先。同値ならレプリカ ID の辞書順。
 */
export function compareStamps(a: Stamp, b: Stamp): number {
  assertStamp(a);
  assertStamp(b);
  if (a.counter !== b.counter) {
    return a.counter < b.counter ? -1 : 1;
  }
  if (a.replicaId === b.replicaId) {
    return 0;
  }
  return a.replicaId < b.replicaId ? -1 : 1;
}

/**
 * 初期状態を作る。stamp は `(0, replicaId)`。
 * 直後の書込みは観測済み最大カウンタ 0 を超える 1 から始まる。
 */
export function createLwwRegister<T>(initialValue: T, replicaId: ReplicaId): LwwRegisterState<T> {
  assertReplicaId(replicaId);
  return {
    value: initialValue,
    stamp: { counter: 0, replicaId },
  };
}

/**
 * 新規書込み。観測済みの最大論理カウンタを超える番号を使う。
 * 同一 stamp の再利用はしない（常に counter = observedMax + 1）。
 */
export function writeLwwRegister<T>(
  state: LwwRegisterState<T>,
  value: T,
  replicaId: ReplicaId,
): LwwRegisterState<T> {
  assertStamp(state.stamp);
  assertReplicaId(replicaId);
  const nextCounter = state.stamp.counter + 1;
  return {
    value,
    stamp: { counter: nextCounter, replicaId },
  };
}

/** 読取値。 */
export function valueLwwRegister<T>(state: LwwRegisterState<T>): T {
  assertStamp(state.stamp);
  return state.value;
}

/**
 * stamp の辞書順最大を勝者とする merge。
 * 同一 stamp なら冪等（どちらを返してもよい。ここでは a を返す）。
 */
export function mergeLwwRegister<T>(
  a: LwwRegisterState<T>,
  b: LwwRegisterState<T>,
): LwwRegisterState<T> {
  assertStamp(a.stamp);
  assertStamp(b.stamp);
  return compareStamps(a.stamp, b.stamp) >= 0 ? a : b;
}

/** 内部状態（value と stamp）が一致するか。 */
export function equalsLwwRegister<T>(
  a: LwwRegisterState<T>,
  b: LwwRegisterState<T>,
  valueEquals: (x: T, y: T) => boolean = Object.is,
): boolean {
  assertStamp(a.stamp);
  assertStamp(b.stamp);
  return (
    compareStamps(a.stamp, b.stamp) === 0 &&
    a.stamp.replicaId === b.stamp.replicaId &&
    valueEquals(a.value, b.value)
  );
}
