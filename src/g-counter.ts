/**
 * G-Counter（増えるだけのカウンタ）。
 *
 * 状態はレプリカ ID ごとの非負整数の写像。加算は自分の成分だけ。
 * 読取値は各成分の合計。merge はレプリカ ID ごとに max を取る。
 *
 * merge で max を取る理由:
 * 各レプリカは自分の加算だけを記録する。相手の成分を加算すると、
 * 同じ状態を複数回受け取ったときに二重計上になる。
 * 成分ごとの最大値を取れば、到着順や重複配送に依らず単調に増え、
 * 最終的に同じ写像へ収束する。
 */

/** レプリカを一意に識別する非空文字列。 */
export type ReplicaId = string;

/** レプリカ ID から非負整数への写像（G-Counter の内部状態）。 */
export type GCounterState = Readonly<Record<ReplicaId, number>>;

function assertReplicaId(replicaId: string): asserts replicaId is ReplicaId {
  if (typeof replicaId !== "string" || replicaId.length === 0) {
    throw new TypeError(`replicaId must be a non-empty string, got ${String(replicaId)}`);
  }
}

/**
 * 非負整数（0 以上の有限整数）であることを入口で検証する。
 * 負の加算・NaN・Infinity・小数は受け付けない。
 */
function assertNonNegativeInt(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount < 0 || !Number.isFinite(amount)) {
    throw new RangeError(`${label} must be a non-negative finite integer, got ${String(amount)}`);
  }
}

function assertValidState(state: GCounterState): void {
  for (const [id, n] of Object.entries(state)) {
    assertReplicaId(id);
    assertNonNegativeInt(n, `state[${id}]`);
  }
}

/** 空の G-Counter を作る。 */
export function createGCounter(): GCounterState {
  return {};
}

/**
 * 自分のレプリカ成分だけに amount を加算する。
 * 他レプリカの成分は変更しない。
 */
export function incrementGCounter(
  state: GCounterState,
  replicaId: ReplicaId,
  amount: number,
): GCounterState {
  assertValidState(state);
  assertReplicaId(replicaId);
  assertNonNegativeInt(amount, "amount");
  if (amount === 0) {
    return state;
  }
  const current = state[replicaId] ?? 0;
  return { ...state, [replicaId]: current + amount };
}

/** 読取値: 各レプリカ成分の合計。 */
export function valueGCounter(state: GCounterState): number {
  assertValidState(state);
  let sum = 0;
  for (const n of Object.values(state)) {
    sum += n;
  }
  return sum;
}

/**
 * レプリカ ID ごとに max を取ってマージする。
 * 受信値を単純加算してはならない（二重計上になる）。
 */
export function mergeGCounter(a: GCounterState, b: GCounterState): GCounterState {
  assertValidState(a);
  assertValidState(b);
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, number> = {};
  for (const id of ids) {
    const left = a[id] ?? 0;
    const right = b[id] ?? 0;
    out[id] = Math.max(left, right);
  }
  return out;
}

/** 内部状態が写像として一致するか（キー集合と各成分）。 */
export function equalsGCounter(a: GCounterState, b: GCounterState): boolean {
  assertValidState(a);
  assertValidState(b);
  const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of ids) {
    if ((a[id] ?? 0) !== (b[id] ?? 0)) {
      return false;
    }
  }
  return true;
}
