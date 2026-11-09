/**
 * local-first-ledger の公開 API。
 * v0.1.0: 自作 G-Counter / 後勝ちレジスタ（ライブラリなし）。
 */

export { environmentReadyMarker } from "./env-marker.js";

export {
  createGCounter,
  incrementGCounter,
  valueGCounter,
  mergeGCounter,
  equalsGCounter,
  type ReplicaId,
  type GCounterState,
} from "./g-counter.js";

export {
  createLwwRegister,
  writeLwwRegister,
  valueLwwRegister,
  mergeLwwRegister,
  equalsLwwRegister,
  compareStamps,
  type Stamp,
  type LwwRegisterState,
} from "./lww-register.js";

export { createPrng, type Prng } from "./prng.js";
