import {
  FAMILY_DISPLAY_NAMES,
  addEntry,
  acquireWriterLock,
  browserRequestLock,
  createLedgerSyncClient,
  createLocalStorageOutboundQueue,
  createLocalStorageSyncCursor,
  getOrCreateDeviceId,
  listEntries,
  observeEntries,
  openLedgerPersistence,
  outboundQueueStorageKey,
  resolveRelayUrl,
  resolveSharedDocumentId,
  syncCursorStorageKey,
  type LedgerEntry,
  type SyncStatus,
  type TabRole,
} from "../src/ledger/index.js";

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
      <p class="lede">共有ドキュメントの明細を端末に保存し、中継サーバー経由で差分だけ同期します。一般公開しないでください。</p>
    </header>

    <section id="tab-warning" class="warning" hidden role="status" data-testid="tab-warning"></section>

    <section class="meta" aria-label="端末・同期情報">
      <p>端末 ID: <code data-testid="device-id">${deviceId}</code></p>
      <p>共有ドキュメント: <code data-testid="document-id">${documentId}</code></p>
      <p>タブ役割: <span data-testid="tab-role">${role}</span></p>
      <p>中継 URL: <code data-testid="relay-url">${relayUrl}</code></p>
      <p>同期: <span data-testid="sync-status">idle</span></p>
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
  </main>
`;

const warning = root.querySelector<HTMLElement>("#tab-warning");
const form = root.querySelector<HTMLFormElement>("#entry-form");
const list = root.querySelector<HTMLUListElement>("#entry-list");
const submit = root.querySelector<HTMLButtonElement>('[data-testid="submit-entry"]');
const syncStatusEl = root.querySelector<HTMLElement>('[data-testid="sync-status"]');

if (
  warning === null ||
  form === null ||
  list === null ||
  submit === null ||
  syncStatusEl === null
) {
  throw new Error("required UI nodes missing");
}

function renderSyncStatus(status: SyncStatus, detail?: string): void {
  if (syncStatusEl === null) {
    return;
  }
  syncStatusEl.textContent = detail === undefined ? status : `${status}: ${detail}`;
  syncStatusEl.dataset.status = status;
}

function renderEntries(entries: LedgerEntry[]): void {
  if (list === null) {
    return;
  }
  if (entries.length === 0) {
    list.innerHTML = `<li data-testid="empty-state">まだ明細がありません</li>`;
    return;
  }
  list.innerHTML = entries
    .map(
      (entry) => `
      <li data-testid="entry-item" data-entry-id="${entry.id}">
        <span data-testid="entry-date">${entry.date}</span>
        <span data-testid="entry-amount">${entry.amount}円</span>
        <span data-testid="entry-category">${entry.category}</span>
        <span data-testid="entry-memo">${entry.memo}</span>
        <span data-testid="entry-entered-by">${entry.enteredBy}</span>
      </li>`,
    )
    .join("");
}

if (role === "follower") {
  warning.hidden = false;
  warning.textContent =
    "この端末では別のタブが書き込み中です。このタブでは閲覧のみで、明細は追加できません。";
  form.querySelectorAll("input, select, button").forEach((el) => {
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

const dateField = form.elements.namedItem("date");
if (dateField instanceof HTMLInputElement) {
  dateField.value = new Date().toISOString().slice(0, 10);
}

renderEntries(listEntries(persisted.ledger));
observeEntries(persisted.ledger, renderEntries);

window.addEventListener(
  "pagehide",
  () => {
    sync?.stop();
  },
  { once: true },
);

document.documentElement.dataset.appReady = "true";
document.documentElement.dataset.documentId = documentId;
