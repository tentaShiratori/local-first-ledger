import {
  FAMILY_DISPLAY_NAMES,
  addEntry,
  acquireWriterLock,
  adjustCategoryBudget,
  browserRequestLock,
  computeTotalAmount,
  createLedgerSyncClient,
  createLocalStorageOutboundQueue,
  createLocalStorageSyncCursor,
  deleteEntry,
  findDuplicateCandidates,
  getOrCreateDeviceId,
  listAllHistoryEvents,
  listCategoryBudgets,
  listEntries,
  listHistoryForEntry,
  observeBudgets,
  observeEntries,
  observeHistory,
  openLedgerPersistence,
  outboundQueueStorageKey,
  resolveRelayUrl,
  resolveSharedDocumentId,
  sortHistoryCausal,
  sortHistoryWallClock,
  syncCursorStorageKey,
  updateEntryFields,
  type DuplicatePair,
  type HistoryEvent,
  type LedgerEntry,
  type SyncStatus,
  type TabRole,
} from "../src/ledger/index.js";

/** 検証スクリプト用の読み取り専用スナップショット（本番機能ではない）。 */
type LedgerVerifySnapshot = {
  documentId: string;
  deviceId: string;
  totalAmount: number;
  entries: Array<{
    id: string;
    date: string;
    amount: number;
    category: string;
    memo: string;
    enteredBy: string;
  }>;
  historyEventCount: number;
};

declare global {
  interface Window {
    __localFirstLedgerSnapshot?: () => LedgerVerifySnapshot;
  }
}

const root = document.querySelector<HTMLDivElement>("#app");
if (root === null) {
  throw new Error("#app not found");
}

const abort = new AbortController();
window.addEventListener("pagehide", () => abort.abort(), { once: true });

const searchParams = new URLSearchParams(window.location.search);
const deviceId = getOrCreateDeviceId(window.localStorage);
const documentId = resolveSharedDocumentId({
  searchParams,
  storage: window.localStorage,
});
const relayUrl = resolveRelayUrl({
  searchParams,
  storage: window.localStorage,
});

const lockSession = await acquireWriterLock({
  requestLock: browserRequestLock(),
  signal: abort.signal,
});
const role: TabRole = lockSession.role;

const persisted = openLedgerPersistence({
  documentId,
  deviceId,
  storage: window.localStorage,
});
await persisted.whenSynced;

const sync =
  role === "writer"
    ? createLedgerSyncClient({
        doc: persisted.ledger.doc,
        docId: documentId,
        relayUrl,
        outbound: createLocalStorageOutboundQueue(
          window.localStorage,
          outboundQueueStorageKey(documentId),
        ),
        cursor: createLocalStorageSyncCursor(window.localStorage, syncCursorStorageKey(documentId)),
        onStatus: (status, detail) => {
          renderSyncStatus(status, detail);
        },
      })
    : null;

root.innerHTML = `
  <main class="page">
    <header class="hero">
      <p class="brand">local-first-ledger</p>
      <h1>オフライン家計簿</h1>
      <p class="lede">フィールド単位の同期・編集優先の削除・予算・重複候補・明細履歴を扱います。一般公開しないでください。</p>
    </header>

    <section id="tab-warning" class="warning" hidden role="status" data-testid="tab-warning"></section>

    <section class="meta" aria-label="端末・同期情報">
      <p>端末 ID: <code data-testid="device-id">${deviceId}</code></p>
      <p>共有ドキュメント: <code data-testid="document-id">${documentId}</code></p>
      <p>タブ役割: <span data-testid="tab-role">${role}</span></p>
      <p>中継 URL: <code data-testid="relay-url">${relayUrl}</code></p>
      <p>同期: <span data-testid="sync-status">idle</span></p>
      <p>合計（計算）: <span data-testid="total-amount">0</span>円</p>
    </section>

    <section class="input-panel" aria-labelledby="input-heading">
      <h2 id="input-heading">明細を追加</h2>
      <form id="entry-form" data-testid="entry-form">
        <label>
          日付
          <input name="date" type="date" required data-testid="field-date" />
        </label>
        <label>
          金額（円）
          <input name="amount" type="number" inputmode="numeric" required step="1" data-testid="field-amount" />
        </label>
        <label>
          カテゴリ
          <input name="category" type="text" required maxlength="40" data-testid="field-category" />
        </label>
        <label>
          メモ
          <input name="memo" type="text" maxlength="80" data-testid="field-memo" />
        </label>
        <label>
          入力者
          <select name="enteredBy" required data-testid="field-entered-by">
            ${FAMILY_DISPLAY_NAMES.map((name) => `<option value="${name}">${name}</option>`).join("")}
          </select>
        </label>
        <button type="submit" data-testid="submit-entry">追加する</button>
      </form>
    </section>

    <section class="list-panel" aria-labelledby="list-heading">
      <h2 id="list-heading">明細一覧</h2>
      <ul id="entry-list" data-testid="entry-list"></ul>
    </section>

    <section class="budget-panel" aria-labelledby="budget-heading">
      <h2 id="budget-heading">カテゴリ予算（足し引き）</h2>
      <form id="budget-form" data-testid="budget-form">
        <label>
          カテゴリ
          <input name="category" type="text" required maxlength="40" data-testid="budget-category" />
        </label>
        <label>
          増減（円）
          <input name="delta" type="number" required step="1" data-testid="budget-delta" />
        </label>
        <button type="submit" data-testid="submit-budget">反映する</button>
      </form>
      <ul id="budget-list" data-testid="budget-list"></ul>
    </section>

    <section class="dup-panel" aria-labelledby="dup-heading">
      <h2 id="dup-heading">重複候補</h2>
      <p class="lede">表示だけで消しません。別物として残すか、手で削除してください。</p>
      <ul id="dup-list" data-testid="dup-list"></ul>
    </section>

    <section class="history-panel" aria-labelledby="history-heading">
      <h2 id="history-heading">明細の変更履歴</h2>
      <p class="lede" data-testid="history-order-help">
        「操作順」は端末内の deviceSeq による並びです。壁時計は記録端末の実時間の目安で、オフライン並行では前後が入れ替わり得ます。同期の正しさは壁時計では決めません。
      </p>
      <fieldset class="history-order" data-testid="history-order">
        <legend>並べ替え</legend>
        <label>
          <input type="radio" name="history-order" value="causal" checked data-testid="history-order-causal" />
          操作順（端末ごと）
        </label>
        <label>
          <input type="radio" name="history-order" value="wall" data-testid="history-order-wall" />
          壁時計（実時間の目安）
        </label>
      </fieldset>
      <div id="history-timeline" data-testid="history-timeline"></div>
    </section>
  </main>
`;

const warning = root.querySelector<HTMLElement>("#tab-warning");
const form = root.querySelector<HTMLFormElement>("#entry-form");
const list = root.querySelector<HTMLUListElement>("#entry-list");
const submit = root.querySelector<HTMLButtonElement>('[data-testid="submit-entry"]');
const syncStatusEl = root.querySelector<HTMLElement>('[data-testid="sync-status"]');
const totalEl = root.querySelector<HTMLElement>('[data-testid="total-amount"]');
const budgetForm = root.querySelector<HTMLFormElement>("#budget-form");
const budgetList = root.querySelector<HTMLUListElement>("#budget-list");
const dupList = root.querySelector<HTMLUListElement>("#dup-list");
const historyTimeline = root.querySelector<HTMLDivElement>("#history-timeline");
const historyOrder = root.querySelector<HTMLFieldSetElement>('[data-testid="history-order"]');

if (
  warning === null ||
  form === null ||
  list === null ||
  submit === null ||
  syncStatusEl === null ||
  totalEl === null ||
  budgetForm === null ||
  budgetList === null ||
  dupList === null ||
  historyTimeline === null ||
  historyOrder === null
) {
  throw new Error("required UI nodes missing");
}

let historyOrderMode: "causal" | "wall" = "causal";
let selectedHistoryEntryId: string | null = null;

function formatWallClock(ms: number): string {
  try {
    return new Date(ms).toLocaleString("ja-JP");
  } catch {
    return String(ms);
  }
}

function formatChanges(event: HistoryEvent): string {
  if (event.changes.length === 0) {
    return "（差分なし）";
  }
  return event.changes
    .map((change) => `${change.field}: ${change.before ?? "∅"} → ${change.after ?? "∅"}`)
    .join(" / ");
}

function renderHistory(entryId: string | null): void {
  if (historyTimeline === null) {
    return;
  }
  if (entryId === null) {
    historyTimeline.innerHTML = `<p data-testid="history-empty">明細行をクリックすると履歴を表示します</p>`;
    return;
  }
  const raw = listHistoryForEntry(persisted.ledger, entryId);
  const events = historyOrderMode === "causal" ? sortHistoryCausal(raw) : sortHistoryWallClock(raw);
  if (events.length === 0) {
    historyTimeline.innerHTML = `<p data-testid="history-empty">この明細の履歴はまだありません</p>`;
    return;
  }
  const orderLabel = historyOrderMode === "causal" ? "操作順" : "壁時計";
  historyTimeline.innerHTML = `
    <p data-testid="history-selected">対象: <code>${entryId}</code>（${orderLabel}）</p>
    <ol data-testid="history-list">
      ${events
        .map(
          (event) => `
        <li data-testid="history-item" data-event-id="${event.eventId}" data-kind="${event.kind}">
          <div><strong>${event.kind}</strong> / ${event.enteredBy} / 端末 <code>${event.deviceId}</code></div>
          <div data-testid="history-when">壁時計: ${formatWallClock(event.wallClockMs)} / 操作順 #${event.deviceSeq}</div>
          <div data-testid="history-changes">${formatChanges(event)}</div>
        </li>`,
        )
        .join("")}
    </ol>
  `;
}

function renderSyncStatus(status: SyncStatus, detail?: string): void {
  if (syncStatusEl === null) {
    return;
  }
  syncStatusEl.textContent = detail === undefined ? status : `${status}: ${detail}`;
  syncStatusEl.dataset.status = status;
}

function renderDuplicates(pairs: DuplicatePair[]): void {
  if (dupList === null) {
    return;
  }
  if (pairs.length === 0) {
    dupList.innerHTML = `<li data-testid="dup-empty">重複候補はありません</li>`;
    return;
  }
  dupList.innerHTML = pairs
    .map(
      (pair) => `
      <li data-testid="dup-item" data-left-id="${pair.leftId}" data-right-id="${pair.rightId}">
        <code>${pair.leftId}</code> と <code>${pair.rightId}</code>（${pair.reason}）
      </li>`,
    )
    .join("");
}

function renderBudgets(budgets: Array<{ category: string; amount: number }>): void {
  if (budgetList === null) {
    return;
  }
  if (budgets.length === 0) {
    budgetList.innerHTML = `<li data-testid="budget-empty">まだ予算がありません</li>`;
    return;
  }
  budgetList.innerHTML = budgets
    .map(
      (row) => `
      <li data-testid="budget-item" data-category="${row.category}">
        <span data-testid="budget-item-category">${row.category}</span>
        <span data-testid="budget-item-amount">${row.amount}円</span>
      </li>`,
    )
    .join("");
}

function renderEntries(entries: LedgerEntry[]): void {
  if (list === null || totalEl === null) {
    return;
  }
  totalEl.textContent = String(computeTotalAmount(persisted.ledger));
  renderDuplicates(findDuplicateCandidates(entries));
  if (entries.length === 0) {
    list.innerHTML = `<li data-testid="empty-state">まだ明細がありません</li>`;
    return;
  }
  const writer = role === "writer";
  list.innerHTML = entries
    .map(
      (entry) => `
      <li data-testid="entry-item" data-entry-id="${entry.id}" class="${selectedHistoryEntryId === entry.id ? "is-selected" : ""}">
        <button type="button" data-testid="show-history" data-entry-id="${entry.id}">履歴</button>
        <span data-testid="entry-date">${entry.date}</span>
        <span data-testid="entry-amount">${entry.amount}円</span>
        <span data-testid="entry-category">${entry.category}</span>
        <span data-testid="entry-memo">${entry.memo}</span>
        <span data-testid="entry-entered-by">${entry.enteredBy}</span>
        ${
          writer
            ? `<button type="button" data-testid="edit-memo" data-entry-id="${entry.id}">メモ編集</button>
               <button type="button" data-testid="edit-amount" data-entry-id="${entry.id}">金額編集</button>
               <button type="button" data-testid="delete-entry" data-entry-id="${entry.id}">削除</button>`
            : ""
        }
      </li>`,
    )
    .join("");
  renderHistory(selectedHistoryEntryId);
}

if (role === "follower") {
  warning.hidden = false;
  warning.textContent =
    "この端末では別のタブが書き込み中です。このタブでは閲覧のみで、明細は追加できません。";
  form.querySelectorAll("input, select, button").forEach((el) => {
    el.setAttribute("disabled", "true");
  });
  budgetForm.querySelectorAll("input, button").forEach((el) => {
    el.setAttribute("disabled", "true");
  });
  renderSyncStatus("idle", "follower tab (no relay writer)");
} else {
  warning.hidden = true;
  sync?.start();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "writer") {
    return;
  }
  const data = new FormData(form);
  const readText = (name: string): string => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  const date = readText("date");
  const amountRaw = readText("amount");
  const category = readText("category");
  const memo = readText("memo");
  const enteredBy = readText("enteredBy");
  const amount = Number(amountRaw);
  addEntry(persisted.ledger, { date, amount, category, memo, enteredBy }, deviceId);
  form.reset();
  const dateInput = form.elements.namedItem("date");
  if (dateInput instanceof HTMLInputElement) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
});

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (role !== "writer") {
    return;
  }
  const data = new FormData(budgetForm);
  const category = data.get("category");
  const deltaRaw = data.get("delta");
  if (typeof category !== "string" || typeof deltaRaw !== "string") {
    return;
  }
  adjustCategoryBudget(persisted.ledger, category, deviceId, Number(deltaRaw));
  budgetForm.reset();
});

list.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const entryId = target.dataset.entryId;
  if (entryId === undefined) {
    return;
  }
  if (target.matches('[data-testid="show-history"]')) {
    selectedHistoryEntryId = entryId;
    renderEntries(listEntries(persisted.ledger));
    return;
  }
  if (role !== "writer") {
    return;
  }
  const enteredBySelect = form.elements.namedItem("enteredBy");
  const enteredBy = enteredBySelect instanceof HTMLSelectElement ? enteredBySelect.value : "たろう";
  if (target.matches('[data-testid="delete-entry"]')) {
    deleteEntry(persisted.ledger, entryId, deviceId, enteredBy);
    return;
  }
  if (target.matches('[data-testid="edit-memo"]')) {
    const next = window.prompt("新しいメモ", "");
    if (next === null) {
      return;
    }
    updateEntryFields(persisted.ledger, entryId, { memo: next }, deviceId, enteredBy);
    return;
  }
  if (target.matches('[data-testid="edit-amount"]')) {
    const next = window.prompt("新しい金額（円）", "");
    if (next === null) {
      return;
    }
    updateEntryFields(persisted.ledger, entryId, { amount: Number(next) }, deviceId, enteredBy);
  }
});

historyOrder.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (target.value === "causal" || target.value === "wall") {
    historyOrderMode = target.value;
    renderHistory(selectedHistoryEntryId);
  }
});

const dateField = form.elements.namedItem("date");
if (dateField instanceof HTMLInputElement) {
  dateField.value = new Date().toISOString().slice(0, 10);
}

renderEntries(listEntries(persisted.ledger));
renderBudgets(listCategoryBudgets(persisted.ledger));
renderHistory(selectedHistoryEntryId);
observeEntries(persisted.ledger, renderEntries);
observeBudgets(persisted.ledger, renderBudgets);
observeHistory(persisted.ledger, () => {
  renderHistory(selectedHistoryEntryId);
});

window.addEventListener(
  "pagehide",
  () => {
    sync?.stop();
  },
  { once: true },
);

window.__localFirstLedgerSnapshot = (): LedgerVerifySnapshot => ({
  documentId,
  deviceId,
  totalAmount: computeTotalAmount(persisted.ledger),
  entries: listEntries(persisted.ledger).map((entry) => ({
    id: entry.id,
    date: entry.date,
    amount: entry.amount,
    category: entry.category,
    memo: entry.memo,
    enteredBy: entry.enteredBy,
  })),
  historyEventCount: listAllHistoryEvents(persisted.ledger).length,
});

document.documentElement.dataset.appReady = "true";
document.documentElement.dataset.documentId = documentId;
