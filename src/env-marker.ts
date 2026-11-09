/**
 * 環境確認用の最小モジュール。
 * CRDT 収束の証拠には使わない。
 */
export function environmentReadyMarker(): string {
  return "local-first-ledger:env-ok";
}
