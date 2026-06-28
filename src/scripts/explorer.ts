type ApiEnvelope<T> = {
  data?: T;
  meta?: Record<string, unknown>;
  nextCursor?: string;
  error?: {
    code: string;
    message: string;
  };
};

type UnknownRecord = Record<string, unknown>;
type Column = {
  key: string;
  label: string;
  value: (record: UnknownRecord) => string;
  className?: string;
};

const apiBase = document.documentElement.dataset.apiBase ?? "https://api.blackrelay.network";
const form = document.querySelector<HTMLFormElement>("[data-explorer-form]");
const results = document.querySelector<HTMLTableSectionElement>("[data-results]");
const resultsHead = document.querySelector<HTMLTableSectionElement>("[data-results-head]");
const resultsSummary = document.querySelector<HTMLElement>("[data-results-summary]");
const activeRouteLabel = document.querySelector<HTMLElement>("[data-active-route]");
const detail = document.querySelector<HTMLElement>("[data-detail]");
const loadMore = document.querySelector<HTMLButtonElement>("[data-load-more]");
const copyDetail = document.querySelector<HTMLButtonElement>("[data-copy-detail]");
const routeTabs = [...document.querySelectorAll<HTMLButtonElement>("[data-route-tab]")];
const countValues = [...document.querySelectorAll<HTMLElement>("[data-count-key]")];
const readyJSON = document.querySelector<HTMLElement>("[data-ready-json]");
const freshnessJSON = document.querySelector<HTMLElement>("[data-freshness-json]");
const sourceGapsJSON = document.querySelector<HTMLElement>("[data-source-gaps-json]");

let activeCursor: string | undefined;
let activePath = "/v1/current/characters";
let activeDetailJSON = "";

const responseCache = new Map<string, ApiEnvelope<unknown[]>>();

const defaultColumns: Column[] = [
  { key: "name", label: "Name", value: recordTitle, className: "cell-strong" },
  { key: "type", label: "Type", value: recordType },
  { key: "environment", label: "Environment", value: (record) => field(record, "environment") },
  { key: "cycle", label: "Cycle", value: (record) => field(record, "cycle") },
  { key: "source", label: "Source", value: (record) => sourceSummary(record) },
  { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
];

const columnSets: Array<[RegExp, Column[]]> = [
  [
    /characters/,
    [
      { key: "name", label: "Character", value: recordTitle, className: "cell-strong" },
      { key: "item", label: "Item ID", value: (record) => fact(record, "item_id", "character_id") },
      { key: "tribe", label: "Tribe", value: (record) => nestedString(record, ["derived", "tribe", "displayName"]) || relationTarget(record, "tribe") },
      { key: "address", label: "Address", value: (record) => truncate(fact(record, "character_address"), 20) },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
  [
    /tribes/,
    [
      { key: "name", label: "Tribe", value: recordTitle, className: "cell-strong" },
      { key: "id", label: "Tribe ID", value: (record) => fact(record, "tribe_id", "item_id") || recordId(record) },
      { key: "tag", label: "Tag", value: (record) => fact(record, "tag", "ticker") },
      { key: "url", label: "URL", value: (record) => fact(record, "url", "profile_url") },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
  [
    /systems/,
    [
      { key: "name", label: "System", value: recordTitle, className: "cell-strong" },
      { key: "id", label: "System ID", value: (record) => fact(record, "system_id", "item_id") || recordId(record) },
      { key: "region", label: "Region", value: (record) => fact(record, "region_name", "region_id") || relationTarget(record, "region") },
      { key: "constellation", label: "Constellation", value: (record) => fact(record, "constellation_name", "constellation_id") || relationTarget(record, "constellation") },
      { key: "security", label: "Class", value: (record) => fact(record, "security_class", "solar_system_class") },
      { key: "source", label: "Source", value: sourceSummary },
    ],
  ],
  [
    /killmails/,
    [
      { key: "id", label: "Killmail", value: (record) => recordId(record), className: "cell-strong" },
      { key: "victim", label: "Victim", value: (record) => field(record, "victimName", "victimDisplayName") || fact(record, "victim_name") },
      { key: "killer", label: "Killer", value: (record) => field(record, "killerName", "killerDisplayName") || fact(record, "killer_name") },
      { key: "system", label: "System", value: (record) => field(record, "systemName") || fact(record, "system_name", "solar_system_id") },
      { key: "time", label: "Occurred", value: (record) => field(record, "occurredAt", "timestamp", "createdAt") },
      { key: "source", label: "Source", value: sourceSummary },
    ],
  ],
  [
    /events/,
    [
      { key: "kind", label: "Event", value: (record) => field(record, "eventKind", "kind"), className: "cell-strong" },
      { key: "module", label: "Module", value: (record) => field(record, "module") || fact(record, "module") },
      { key: "tx", label: "Transaction", value: (record) => truncate(field(record, "transactionDigest") || fact(record, "transaction_digest"), 18) },
      { key: "checkpoint", label: "Checkpoint", value: (record) => field(record, "checkpoint", "checkpointSequenceNumber") },
      { key: "time", label: "Occurred", value: (record) => field(record, "occurredAt", "timestamp", "createdAt") },
      { key: "source", label: "Source", value: sourceSummary },
    ],
  ],
  [
    /types|items|materials|enemies|recipes|blueprints|ships|structures/,
    [
      { key: "name", label: "Name", value: recordTitle, className: "cell-strong" },
      { key: "type", label: "Type ID", value: (record) => fact(record, "type_id", "item_id") || recordId(record) },
      { key: "group", label: "Group", value: (record) => fact(record, "group_name", "group_id") },
      { key: "category", label: "Category", value: (record) => fact(record, "category_name", "category_id") },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
];

function endpoint(path: string, params?: URLSearchParams): string {
  const url = new URL(path, apiBase);
  if (params) {
    for (const [key, value] of params.entries()) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}

async function fetchEnvelope<T>(path: string, params?: URLSearchParams): Promise<ApiEnvelope<T>> {
  const request = endpoint(path, params);
  const cached = responseCache.get(request);
  if (cached) {
    return cached as ApiEnvelope<T>;
  }

  const response = await fetch(request, {
    headers: {
      accept: "application/json",
    },
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Request failed with ${response.status}`);
  }
  if (responseCache.size > 24) {
    responseCache.clear();
  }
  responseCache.set(request, body as ApiEnvelope<unknown[]>);
  return body;
}

async function fetchText(path: string): Promise<string> {
  const response = await fetch(endpoint(path), {
    headers: {
      accept: "text/plain",
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(body.trim() || `Request failed with ${response.status}`);
  }
  return body;
}

function formParams(cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (!form) {
    return params;
  }
  const data = new FormData(form);
  for (const key of ["q", "cycles", "environment", "limit"]) {
    const value = String(data.get(key) ?? "").trim();
    if (value) {
      params.set(key, value);
    }
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params;
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function nestedRecord(record: UnknownRecord, key: string): UnknownRecord {
  return asRecord(record[key]);
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return "";
}

function nestedString(record: UnknownRecord, path: string[]): string {
  let current: unknown = record;
  for (const part of path) {
    current = asRecord(current)[part];
  }
  return firstString(current);
}

function field(record: UnknownRecord, ...keys: string[]): string {
  const entity = nestedRecord(record, "entity");
  for (const key of keys) {
    const value = firstString(record[key], entity[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function fact(record: UnknownRecord, ...keys: string[]): string {
  const facts = nestedRecord(record, "facts");
  for (const key of keys) {
    const value = firstString(facts[key]);
    if (value) {
      return value;
    }
  }
  return "";
}

function relationTarget(record: UnknownRecord, type: string): string {
  const relations = record.outgoingRelations;
  if (!Array.isArray(relations)) {
    return "";
  }
  for (const value of relations) {
    const relation = asRecord(value);
    if (firstString(relation.objectEntityType) === type) {
      return firstString(relation.objectDisplayName, relation.objectEntityId);
    }
  }
  return "";
}

function recordId(record: UnknownRecord): string {
  const entity = nestedRecord(record, "entity");
  return firstString(record.id, record.entityId, record.sourceId, record.slug, entity.id, entity.slug);
}

function recordTitle(record: UnknownRecord): string {
  const entity = nestedRecord(record, "entity");
  return (
    firstString(
      record.displayName,
      record.name,
      record.title,
      record.eventKind,
      record.kind,
      entity.displayName,
      entity.name,
      entity.slug,
      record.id,
    ) || "Unnamed record"
  );
}

function recordType(record: UnknownRecord): string {
  const entity = nestedRecord(record, "entity");
  return firstString(record.entityType, record.entity_type, record.collection, record.kind, entity.entityType, "record");
}

function sourceSummary(record: UnknownRecord): string {
  const sources = record.sourceIds;
  if (Array.isArray(sources) && sources.length > 0) {
    return `${sources.length} source${sources.length === 1 ? "" : "s"}`;
  }
  return firstString(record.sourceKind, record.sourceId, "source-backed");
}

function truncate(value: string, length: number): string {
  if (!value || value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1))}…`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

function parseMetrics(text: string): Map<string, number> {
  const values = new Map<string, number>();
  const pattern = /^blackrelay_api_([a-z_]+)\s+(\d+(?:\.\d+)?)$/gm;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    values.set(match[1], Number(match[2]));
  }

  return values;
}

function columnsForPath(path: string): Column[] {
  return columnSets.find(([pattern]) => pattern.test(path))?.[1] ?? defaultColumns;
}

function renderError(message: string): void {
  if (resultsSummary) {
    resultsSummary.textContent = message;
  }
  if (results) {
    results.innerHTML = `<tr><td colspan="${columnsForPath(activePath).length}">${escapeHTML(message)}</td></tr>`;
  }
  if (loadMore) {
    loadMore.hidden = true;
  }
}

function renderHead(columns: Column[]): void {
  if (!resultsHead) {
    return;
  }
  resultsHead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join("")}</tr>`;
}

function renderRecords(records: unknown[], append = false): void {
  if (!results || !resultsSummary) {
    return;
  }
  const columns = columnsForPath(activePath);
  renderHead(columns);
  if (!append) {
    results.innerHTML = "";
  }
  resultsSummary.textContent = `${records.length} record${records.length === 1 ? "" : "s"} from ${activePath}.`;
  if (records.length === 0 && !append) {
    results.innerHTML = `<tr><td colspan="${columns.length}">No records matched this query.</td></tr>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const value of records) {
    const record = asRecord(value);
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.dataset.recordId = recordId(record);
    row.dataset.recordType = recordType(record);
    row.innerHTML = columns
      .map((column) => {
        const className = column.className ? ` class="${column.className}"` : "";
        return `<td${className}>${escapeHTML(column.value(record) || "—")}</td>`;
      })
      .join("");
    row.addEventListener("click", () => showDetail(record));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showDetail(record);
      }
    });
    fragment.append(row);
  }
  results.append(fragment);
}

function syncRouteControls(path: string): void {
  if (form) {
    const select = form.elements.namedItem("route");
    if (select instanceof HTMLSelectElement) {
      select.value = path;
    }
  }
  for (const tab of routeTabs) {
    tab.setAttribute("aria-pressed", String(tab.dataset.routeTab === path));
  }
  if (activeRouteLabel) {
    const matchingTab = routeTabs.find((tab) => tab.dataset.routeTab === path);
    activeRouteLabel.textContent = matchingTab?.textContent?.trim().replace(/\s+/g, " ").toUpperCase() ?? path.toUpperCase();
  }
}

async function runQuery(cursor?: string): Promise<void> {
  if (!form) {
    return;
  }
  const data = new FormData(form);
  activePath = String(data.get("route") ?? "/v1/current/characters");
  syncRouteControls(activePath);
  if (resultsSummary) {
    resultsSummary.textContent = cursor ? "Loading next cursor..." : "Loading records...";
  }
  if (!cursor && results) {
    const columns = columnsForPath(activePath);
    renderHead(columns);
    results.innerHTML = `<tr><td colspan="${columns.length}">Querying ${escapeHTML(activePath)}...</td></tr>`;
  }
  try {
    const body = await fetchEnvelope<unknown[]>(activePath, formParams(cursor));
    activeCursor = body.nextCursor;
    renderRecords(Array.isArray(body.data) ? body.data : [], Boolean(cursor));
    if (loadMore) {
      loadMore.hidden = !activeCursor;
    }
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

async function showDetail(record: UnknownRecord): Promise<void> {
  const id = recordId(record);
  const type = recordType(record);
  const isEvent = activePath.includes("/events");
  const isKillmail = activePath.includes("/killmails");
  const isSource = activePath.includes("/sources");

  let path = "";
  if (isEvent && id) {
    path = `/v1/events/${encodeURIComponent(id)}`;
  } else if (isKillmail && id) {
    path = `/v1/killmails/${encodeURIComponent(id)}`;
  } else if (isSource && id) {
    path = `/v1/sources/${encodeURIComponent(id)}`;
  } else if (id && type !== "document") {
    path = `/v1/entities/${encodeURIComponent(id)}/history`;
  }

  if (!path) {
    setDetail(record);
    return;
  }

  if (detail) {
    detail.textContent = `Fetching ${path}...`;
  }
  try {
    const body = await fetchEnvelope<unknown>(path);
    setDetail(body.data ?? record);
  } catch {
    setDetail(record);
  }
}

function setDetail(value: unknown): void {
  activeDetailJSON = JSON.stringify(value, null, 2);
  if (detail) {
    detail.textContent = activeDetailJSON;
  }
  if (copyDetail) {
    copyDetail.hidden = false;
  }
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] ?? char;
  });
}

async function loadOperations(): Promise<void> {
  const targets = [
    ["/v1/ready", readyJSON],
    ["/v1/ops/freshness", freshnessJSON],
    ["/v1/ops/source-gaps", sourceGapsJSON],
  ] as const;

  await Promise.all(
    targets.map(async ([path, target]) => {
      try {
        const body = await fetchEnvelope<unknown>(path);
        if (target) {
          target.textContent = JSON.stringify(body.data ?? body, null, 2);
        }
      } catch (error) {
        if (target) {
          target.textContent = error instanceof Error ? error.message : String(error);
        }
      }
    }),
  );
}

async function loadCounts(): Promise<void> {
  if (countValues.length === 0) {
    return;
  }

  try {
    const metrics = parseMetrics(await fetchText("/v1/metrics"));
    for (const target of countValues) {
      const key = target.dataset.countKey;
      const value = key ? metrics.get(key) : undefined;
      target.textContent = value === undefined ? "..." : formatCount(value);
    }
  } catch {
    for (const target of countValues) {
      target.textContent = "unavailable";
    }
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  void runQuery();
});

const routeSelect = form?.elements.namedItem("route");
if (routeSelect instanceof HTMLSelectElement) {
  routeSelect.addEventListener("change", () => {
    void runQuery();
  });
}

loadMore?.addEventListener("click", () => {
  if (activeCursor) {
    void runQuery(activeCursor);
  }
});

copyDetail?.addEventListener("click", async () => {
  if (!activeDetailJSON) {
    return;
  }
  await navigator.clipboard.writeText(activeDetailJSON);
});

for (const tab of routeTabs) {
  tab.addEventListener("click", () => {
    const route = tab.dataset.routeTab;
    if (!route || !form) {
      return;
    }
    const select = form.elements.namedItem("route");
    if (select instanceof HTMLSelectElement) {
      select.value = route;
      void runQuery();
    }
  });
}

for (const shortcut of document.querySelectorAll<HTMLButtonElement>("[data-route-shortcut]")) {
  shortcut.addEventListener("click", () => {
    if (!form) {
      return;
    }
    const route = shortcut.dataset.routeShortcut;
    const select = form.elements.namedItem("route");
    if (route && select instanceof HTMLSelectElement) {
      select.value = route;
      document.querySelector("#search")?.scrollIntoView({ behavior: "smooth", block: "start" });
      void runQuery();
    }
  });
}

syncRouteControls(activePath);
void loadCounts();
void runQuery().finally(() => {
  window.setTimeout(() => {
    void loadOperations();
  }, 250);
});
