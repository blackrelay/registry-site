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
type PageState = {
  cursor?: string;
  nextCursor?: string;
  records: unknown[];
};

const apiBase = document.documentElement.dataset.apiBase ?? "https://api.blackrelay.network";
const form = document.querySelector<HTMLFormElement>("[data-explorer-form]");
const results = document.querySelector<HTMLTableSectionElement>("[data-results]");
const resultsHead = document.querySelector<HTMLTableSectionElement>("[data-results-head]");
const resultsSummary = document.querySelector<HTMLElement>("[data-results-summary]");
const activeRouteLabel = document.querySelector<HTMLElement>("[data-active-route]");
const detail = document.querySelector<HTMLElement>("[data-detail]");
const pagination = document.querySelector<HTMLElement>("[data-pagination]");
const pageFirst = document.querySelector<HTMLButtonElement>("[data-page-first]");
const pagePrev = document.querySelector<HTMLButtonElement>("[data-page-prev]");
const pageNext = document.querySelector<HTMLButtonElement>("[data-page-next]");
const pageList = document.querySelector<HTMLElement>("[data-page-list]");
const copyDetail = document.querySelector<HTMLButtonElement>("[data-copy-detail]");
const routeTabs = [...document.querySelectorAll<HTMLButtonElement>("[data-route-tab]")];
const countValues = [...document.querySelectorAll<HTMLElement>("[data-count-key]")];
const routeCountValues = [...document.querySelectorAll<HTMLElement>("[data-route-count-key]")];
const readyJSON = document.querySelector<HTMLElement>("[data-ready-json]");
const freshnessJSON = document.querySelector<HTMLElement>("[data-freshness-json]");
const apiStatusPill = document.querySelector<HTMLElement>('[data-status-key="api"]');
const apiStatusValue = document.querySelector<HTMLElement>('[data-status-value="api"]');
const routeWarning = document.querySelector<HTMLElement>("[data-route-warning]");
const freshnessState = document.querySelector<HTMLElement>("[data-freshness-state]");
const lastExport = document.querySelector<HTMLElement>("[data-last-export]");
const staleCount = document.querySelector<HTMLElement>("[data-stale-count]");
const oldestStale = document.querySelector<HTMLElement>("[data-oldest-stale]");

let activePath = "/v1/search";
let activeBaseParams = new URLSearchParams();
let activeDetailJSON = "";
let activePageIndex = 0;
let activePages: PageState[] = [];
let metricValues = new Map<string, number>();
let readyEnvelopePromise: Promise<ApiEnvelope<unknown>> | undefined;

const responseCache = new Map<string, ApiEnvelope<unknown[]>>();

const routeWarnings: Array<[RegExp, string]> = [
  [
    /characters/,
    "Public chain-derived records. Do not treat address, tribe or name data as identity proof without checking source and timestamp.",
  ],
  [/killmails/, "Coverage depends on indexed sources and may be stale or incomplete."],
  [
    /types|items|materials|enemies|recipes|blueprints|ships|structures|systems|regions|constellations/,
    "Static client-derived records may change after patches.",
  ],
];

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
      { key: "id", label: "Tribe ID", value: (record) => formatIdentifier(fact(record, "tribe_id", "item_id") || recordId(record)) },
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
      { key: "id", label: "System ID", value: (record) => formatIdentifier(fact(record, "system_id", "item_id") || recordId(record)) },
      { key: "region", label: "Region", value: (record) => fact(record, "region_name", "region_id") || nestedString(record, ["derived", "region", "displayName"]) || relationTarget(record, "region") },
      { key: "constellation", label: "Constellation", value: (record) => fact(record, "constellation_name", "constellation_id") || nestedString(record, ["derived", "constellation", "displayName"]) || relationTarget(record, "constellation") },
      { key: "coords", label: "Coordinates", value: coordinates },
      { key: "security", label: "Class", value: (record) => fact(record, "security_class", "solar_system_class") },
      { key: "source", label: "Source", value: sourceSummary },
    ],
  ],
  [
    /regions/,
    [
      { key: "name", label: "Region", value: recordTitle, className: "cell-strong" },
      { key: "id", label: "Region ID", value: (record) => formatIdentifier(fact(record, "region_id", "item_id") || recordId(record)) },
      { key: "constellations", label: "Constellations", value: (record) => fact(record, "constellation_count") || nestedString(record, ["derived", "connectedSystemCount"]) },
      { key: "coords", label: "Coordinates", value: coordinates },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
  [
    /constellations/,
    [
      { key: "name", label: "Constellation", value: recordTitle, className: "cell-strong" },
      { key: "id", label: "Constellation ID", value: (record) => formatIdentifier(fact(record, "constellation_id", "item_id") || recordId(record)) },
      { key: "region", label: "Region", value: (record) => fact(record, "region_name", "region_id") || nestedString(record, ["derived", "region", "displayName"]) || relationTarget(record, "region") },
      { key: "systems", label: "Systems", value: (record) => fact(record, "system_count") || nestedString(record, ["derived", "connectedSystemCount"]) },
      { key: "coords", label: "Coordinates", value: coordinates },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
  [
    /gates/,
    [
      { key: "name", label: "Gate", value: recordTitle, className: "cell-strong" },
      { key: "id", label: "Gate ID", value: (record) => formatIdentifier(fact(record, "item_id") || recordId(record)) },
      { key: "system", label: "System", value: (record) => nestedString(record, ["derived", "system", "displayName"]) || relationTarget(record, "system", ["located_in", "deployed_in", "observed_in"]) || formatIdentifier(fact(record, "solar_system_id", "system_id")) },
      { key: "coords", label: "Coordinates", value: coordinates },
      { key: "linked", label: "Linked Gate", value: (record) => relationTarget(record, "gate", ["links_to"]) || formatIdentifier(fact(record, "linked_gate_id", "linked_gate_placeholder")) },
      { key: "source", label: "Source", value: sourceSummary },
      { key: "updated", label: "Updated", value: (record) => field(record, "updatedAt", "createdAt") },
    ],
  ],
  [
    /killmails/,
    [
      { key: "id", label: "Killmail", value: (record) => formatIdentifier(recordId(record)), className: "cell-strong" },
      { key: "victim", label: "Victim", value: (record) => resolvedValue(record, "victim", "victimName", "victimDisplayName", "victimCharacterId") || fact(record, "victim_name") },
      { key: "killer", label: "Killer", value: (record) => resolvedValue(record, "killer", "killerName", "killerDisplayName", "killerCharacterId", "killerTypeId") || fact(record, "killer_name") },
      { key: "system", label: "System", value: (record) => resolvedValue(record, "system", "systemName", "systemId") || fact(record, "system_name", "solar_system_id") },
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

function setApiStatus(value: "CHECKING" | "ONLINE" | "SERVICE BAD" | "OFFLINE", tone: "default" | "good" | "warn" | "bad", title?: string): void {
  if (apiStatusPill) {
    apiStatusPill.dataset.tone = tone;
  }
  if (apiStatusValue) {
    apiStatusValue.textContent = value;
    if (title) {
      apiStatusValue.title = title;
    } else {
      apiStatusValue.removeAttribute("title");
    }
  }
}

function readyPayloadLooksHealthy(payload: ApiEnvelope<unknown>): boolean {
  const data = asRecord(payload.data ?? payload);
  const status = firstString(data.status, data.ready, data.ok).toLowerCase();
  if (!status) {
    return true;
  }
  return ["ok", "ready", "online", "true"].includes(status);
}

async function loadApiStatus(): Promise<void> {
  setApiStatus("CHECKING", "warn");
  try {
    const body = await fetchReadyEnvelope();
    if (readyPayloadLooksHealthy(body)) {
      setApiStatus("ONLINE", "good");
    } else {
      setApiStatus("SERVICE BAD", "warn", "The API responded, but readiness was not healthy.");
    }
  } catch (error) {
    setApiStatus("OFFLINE", "bad", error instanceof Error ? error.message : String(error));
  }
}

function fetchReadyEnvelope(): Promise<ApiEnvelope<unknown>> {
  readyEnvelopePromise ??= fetchEnvelope<unknown>("/v1/ready");
  return readyEnvelopePromise;
}

function cycleParam(value: string): string {
  if (value === "6") {
    return value;
  }
  return "";
}

function formParams(cursor?: string): URLSearchParams {
  const params = new URLSearchParams();
  if (!form) {
    return params;
  }
  const data = new FormData(form);
  for (const key of ["q", "cycles", "environment", "limit"]) {
    const value = String(data.get(key) ?? "").trim();
    if (key === "cycles") {
      const cycleValue = cycleParam(value);
      if (cycleValue) {
        params.set(key, cycleValue);
      }
      continue;
    }
    if (value) {
      params.set(key, value);
    }
  }
  if (activePath === "/v1/current/characters" && !params.has("profile")) {
    params.set("profile", "known");
  }
  if (cursor) {
    params.set("cursor", cursor);
  }
  return params;
}

function paramsWithCursor(cursor?: string): URLSearchParams {
  const params = new URLSearchParams(activeBaseParams);
  if (cursor) {
    params.set("cursor", cursor);
  } else {
    params.delete("cursor");
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

function relationTarget(record: UnknownRecord, type: string, predicates: string[] = []): string {
  const predicateSet = new Set(predicates);
  const candidates = [
    ["outgoingRelations", "objectEntityType", "objectDisplayName", "objectEntityId"],
    ["incomingRelations", "subjectEntityType", "subjectDisplayName", "subjectEntityId"],
  ] as const;
  for (const [relationKey, typeKey, displayKey, idKey] of candidates) {
    const relations = record[relationKey];
    if (!Array.isArray(relations)) {
      continue;
    }
    for (const value of relations) {
      const relation = asRecord(value);
      if (predicateSet.size > 0 && !predicateSet.has(firstString(relation.predicate))) {
        continue;
      }
      const entityID = firstString(relation[idKey]);
      const entityType = firstString(relation[typeKey]) || entityID.split(":")[0] || "";
      if (entityType === type) {
        return formatDisplayText(firstString(relation[displayKey])) || formatIdentifier(entityID);
      }
    }
  }
  return "";
}

function resolvedValue(record: UnknownRecord, key: string, ...fallbackKeys: string[]): string {
  const value = asRecord(record[key]);
  const resolved = firstString(value.displayName, value.name, value.rawId, value.entityId, value.typeId);
  if (resolved) {
    return formatDisplayText(formatIdentifier(resolved));
  }
  return formatIdentifier(field(record, ...fallbackKeys));
}

function recordId(record: UnknownRecord): string {
  const entity = nestedRecord(record, "entity");
  return firstString(record.id, record.entityId, record.sourceId, record.slug, entity.id, entity.slug);
}

function recordTitle(record: UnknownRecord): string {
  const entity = nestedRecord(record, "entity");
  const title =
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
    ) || "Unnamed record";
  return formatDisplayText(formatIdentifier(title));
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
  const semanticSources = record.sources;
  if (Array.isArray(semanticSources) && semanticSources.length > 0) {
    return `${semanticSources.length} source${semanticSources.length === 1 ? "" : "s"}`;
  }
  return firstString(record.sourceKind, record.sourceId, "source-backed");
}

function truncate(value: string, length: number): string {
  if (!value || value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 1))}…`;
}

function coordinates(record: UnknownRecord): string {
  const facts = nestedRecord(record, "facts");
  const coordinates = facts.coordinates ?? facts.position ?? record.coordinates ?? record.position;
  if (Array.isArray(coordinates) && coordinates.length >= 3) {
    return coordinates.slice(0, 3).map((value) => firstString(value) || "?").join(", ");
  }
  if (typeof coordinates === "object" && coordinates !== null) {
    const coordinateRecord = asRecord(coordinates);
    const x = firstString(coordinateRecord.x, coordinateRecord.X);
    const y = firstString(coordinateRecord.y, coordinateRecord.Y);
    const z = firstString(coordinateRecord.z, coordinateRecord.Z);
    if (x || y || z) {
      return [x || "?", y || "?", z || "?"].join(", ");
    }
  }
  const x = fact(record, "x", "position_x", "coordinate_x", "location_x");
  const y = fact(record, "y", "position_y", "coordinate_y", "location_y");
  const z = fact(record, "z", "position_z", "coordinate_z", "location_z");
  if (!x && !y && !z) {
    return "";
  }
  return [x || "?", y || "?", z || "?"].join(", ");
}

function formatIdentifier(value: string): string {
  value = value.trim();
  if (!value) {
    return "";
  }
  const entityPrefix = /^(character|tribe|assembly|gate|storage|turret|system|region|constellation|item|material|recipe|blueprint|ship|structure|enemy|site|route|killmail):([^:]+):(.+)$/;
  const match = entityPrefix.exec(value);
  if (match) {
    value = match[3] ?? value;
    if (value.startsWith("type:")) {
      value = value.slice("type:".length);
    }
  }
  return stripWrappingNameQuotes(compactLongHex(value));
}

function formatDisplayText(value: string): string {
  value = stripWrappingNameQuotes(value.trim());
  if (!value) {
    return "";
  }
  return value.replace(/\b(Gate|Assembly|Storage|Turret|Route)\s+(0x[0-9a-fA-F]{16,})\b/g, (_match, label: string, id: string) => `${label} ${compactLongHex(id)}`);
}

function stripWrappingNameQuotes(value: string): string {
  let out = value.trim();
  while ((out.startsWith("'") && out.endsWith("'")) || (out.startsWith("’") && out.endsWith("’"))) {
    out = out.slice(1, -1).trim();
  }
  return out
    .replace(/(^|[\s([])['’]([^'’]+)['’](?=$|[\s),.;:])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLongHex(value: string): string {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{17,}$/.test(hex)) {
    return trimmed;
  }
  return hex.slice(0, 12);
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
    results.innerHTML = `<tr><td colspan="${columnsForPath(activePath).length + 1}">${escapeHTML(message)}</td></tr>`;
  }
  if (pagination) {
    pagination.hidden = true;
  }
}

function renderHead(columns: Column[]): void {
  if (!resultsHead) {
    return;
  }
  resultsHead.innerHTML = `<tr>${columns.map((column) => `<th>${escapeHTML(column.label)}</th>`).join("")}<th>Actions</th></tr>`;
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
  const total = activeRouteTotal();
  resultsSummary.textContent = `${records.length} record${records.length === 1 ? "" : "s"} on page ${activePageIndex + 1} from ${activePath}${total === "" ? "" : `; ${total} total`}.`;
  if (records.length === 0 && !append) {
    results.innerHTML = `<tr><td colspan="${columns.length + 1}">No records matched this query.</td></tr>`;
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const value of records) {
    const record = asRecord(value);
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.dataset.recordId = recordId(record);
    row.dataset.recordType = recordType(record);
    row.innerHTML = `${columns
      .map((column) => {
        const className = column.className ? ` class="${column.className}"` : "";
        return `<td${className}>${escapeHTML(column.value(record) || "—")}</td>`;
      })
      .join("")}<td class="cell-actions"></td>`;
    const actionsCell = row.querySelector<HTMLElement>(".cell-actions");
    if (actionsCell) {
      actionsCell.append(renderRowActions(record));
    }
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

function renderPageNavigator(): void {
  const currentPage = activePages[activePageIndex];
  const hasAnyPage = activePages.length > 0;
  const hasPrevious = activePageIndex > 0;
  const hasNext = Boolean(currentPage?.nextCursor);

  if (pagination) {
    pagination.hidden = !hasAnyPage;
  }
  if (pageFirst) {
    pageFirst.disabled = !hasPrevious;
  }
  if (pagePrev) {
    pagePrev.disabled = !hasPrevious;
  }
  if (pageNext) {
    pageNext.disabled = !hasNext;
  }
  if (!pageList) {
    return;
  }

  pageList.replaceChildren();
  const windowSize = 5;
  const start = Math.max(0, activePageIndex - windowSize + 1);
  const end = Math.min(activePages.length, start + windowSize);
  activePages.slice(start, end).forEach((_, offset) => {
    const index = start + offset;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plain-button page-number";
    button.textContent = String(index + 1);
    button.setAttribute("aria-label", `Go to page ${index + 1}`);
    button.setAttribute("aria-current", index === activePageIndex ? "page" : "false");
    button.disabled = index === activePageIndex;
    button.addEventListener("click", () => {
      renderCachedPage(index);
    });
    pageList.append(button);
  });
}

function renderCachedPage(index: number): void {
  const page = activePages[index];
  if (!page) {
    return;
  }
  activePageIndex = index;
  renderRecords(page.records);
  renderPageNavigator();
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
    if (matchingTab) {
      const kind = matchingTab.dataset.routeKind?.trim().toUpperCase() ?? "";
      const label = matchingTab.dataset.routeLabel?.trim().toUpperCase() ?? "";
      activeRouteLabel.textContent = [kind, label].filter(Boolean).join(" ");
    } else {
      activeRouteLabel.textContent = path.toUpperCase();
    }
  }
  if (routeWarning) {
    routeWarning.textContent =
      routeWarnings.find(([pattern]) => pattern.test(path))?.[1] ??
      "Frontier data can change after patches or cycle resets. Check source, cycle and timestamp before relying on a record.";
  }
}

async function startQuery(): Promise<void> {
  if (!form) {
    return;
  }
  const data = new FormData(form);
  activePath = String(data.get("route") ?? "/v1/search");
  activeBaseParams = formParams();
  activePageIndex = 0;
  activePages = [];
  syncRouteControls(activePath);
  if (resultsSummary) {
    resultsSummary.textContent = "Loading records...";
  }
  if (results) {
    const columns = columnsForPath(activePath);
    renderHead(columns);
    results.innerHTML = `<tr><td colspan="${columns.length}">Querying ${escapeHTML(activePath)}...</td></tr>`;
  }
  renderPageNavigator();
  await fetchPage(undefined, 0);
}

async function fetchPage(cursor: string | undefined, index: number): Promise<void> {
  if (resultsSummary) {
    resultsSummary.textContent = index === 0 ? "Loading page 1..." : `Loading page ${index + 1}...`;
  }
  try {
    const body = await fetchEnvelope<unknown[]>(activePath, paramsWithCursor(cursor));
    const records = Array.isArray(body.data) ? body.data : [];
    activePages[index] = {
      cursor,
      nextCursor: body.nextCursor,
      records,
    };
    activePageIndex = index;
    renderRecords(records);
    renderPageNavigator();
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

async function goToNextPage(): Promise<void> {
  const currentPage = activePages[activePageIndex];
  if (!currentPage?.nextCursor) {
    return;
  }
  const nextIndex = activePageIndex + 1;
  if (activePages[nextIndex]) {
    renderCachedPage(nextIndex);
    return;
  }
  await fetchPage(currentPage.nextCursor, nextIndex);
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

function renderRowActions(record: UnknownRecord): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "row-actions";
  const id = recordId(record);
  const apiURL = detailApiPath(record);
  const actions: Array<[string, () => void | Promise<void>]> = [
    ["View", () => showDetail(record)],
    ["Copy ID", () => copyText(id)],
    ["Copy API URL", () => copyText(apiURL ? endpoint(apiURL) : endpoint(activePath, activeBaseParams))],
    ["View JSON", () => setDetail(record)],
    ["View sources", () => showSources(record)],
  ];

  for (const [label, action] of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plain-button row-action";
    button.textContent = label;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void action();
    });
    wrap.append(button);
  }
  return wrap;
}

function detailApiPath(record: UnknownRecord): string {
  const id = recordId(record);
  const type = recordType(record);
  if (!id) {
    return "";
  }
  if (activePath.includes("/events")) {
    return `/v1/events/${encodeURIComponent(id)}`;
  }
  if (activePath.includes("/killmails")) {
    return `/v1/killmails/${encodeURIComponent(id)}`;
  }
  if (activePath.includes("/sources")) {
    return `/v1/sources/${encodeURIComponent(id)}`;
  }
  if (type !== "document") {
    return `/v1/entities/${encodeURIComponent(id)}`;
  }
  return "";
}

async function copyText(value: string): Promise<void> {
  if (!value) {
    return;
  }
  await navigator.clipboard.writeText(value);
}

function showSources(record: UnknownRecord): void {
  const sourcePayload = {
    id: recordId(record),
    sourceIds: record.sourceIds ?? [],
    sources: record.sources ?? [],
    outgoingRelations: record.outgoingRelations ?? [],
    incomingRelations: record.incomingRelations ?? [],
  };
  setDetail(sourcePayload);
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

function activeRouteTotal(): string {
  const matchingTab = routeTabs.find((tab) => tab.dataset.routeTab === activePath);
  const key = matchingTab?.querySelector<HTMLElement>("[data-route-count-key]")?.dataset.routeCountKey;
  const value = key ? metricValues.get(key) : undefined;
  return value === undefined ? "" : formatCount(value);
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
  ] as const;

  await Promise.all(
    targets.map(async ([path, target]) => {
      try {
        const body = path === "/v1/ready" ? await fetchReadyEnvelope() : await fetchEnvelope<unknown>(path);
        if (target) {
          target.textContent = JSON.stringify(body.data ?? body, null, 2);
        }
        if (path === "/v1/ops/freshness") {
          renderFreshnessSummary(body.data);
        }
        if (path === "/v1/ready") {
          if (readyPayloadLooksHealthy(body)) {
            setApiStatus("ONLINE", "good");
          } else {
            setApiStatus("SERVICE BAD", "warn", "The API responded, but readiness was not healthy.");
          }
        }
      } catch (error) {
        if (target) {
          target.textContent = error instanceof Error ? error.message : String(error);
        }
        if (path === "/v1/ready") {
          setApiStatus("OFFLINE", "bad", error instanceof Error ? error.message : String(error));
        }
      }
    }),
  );
}

function renderFreshnessSummary(value: unknown): void {
  const rows = Array.isArray(value) ? value.map(asRecord) : [];
  const staleRows = rows.filter((row) => firstString(row.stalenessStatus) !== "live_indexed");
  const updatedValues = rows
    .map((row) => Date.parse(firstString(row.updatedAt, row.lastSuccessfulIngest)))
    .filter(Number.isFinite);
  const staleValues = staleRows
    .map((row) => ({
      source: firstString(row.source) || "unknown",
      time: Date.parse(firstString(row.lastSuccessfulIngest, row.updatedAt)),
    }))
    .filter((row) => Number.isFinite(row.time))
    .sort((a, b) => a.time - b.time);

  if (freshnessState) {
    freshnessState.textContent = rows.length === 0 ? "Not reported" : staleRows.length > 0 ? "Mixed" : "Live indexed";
  }
  if (lastExport) {
    const latest = updatedValues.length > 0 ? new Date(Math.max(...updatedValues)).toISOString() : "";
    lastExport.textContent = latest || "Not reported";
  }
  if (staleCount) {
    staleCount.textContent = String(staleRows.length);
  }
  if (oldestStale) {
    oldestStale.textContent = staleValues[0] ? `${compactSource(staleValues[0].source)} // ${new Date(staleValues[0].time).toISOString()}` : "None reported";
  }
}

function compactSource(value: string): string {
  if (value.length <= 48) {
    return value;
  }
  return `${value.slice(0, 21)}…${value.slice(-22)}`;
}

async function loadCounts(): Promise<void> {
  if (countValues.length === 0 && routeCountValues.length === 0) {
    return;
  }

  try {
    metricValues = parseMetrics(await fetchText("/v1/metrics"));
    for (const target of countValues) {
      const key = target.dataset.countKey;
      const value = key ? metricValues.get(key) : undefined;
      target.textContent = value === undefined ? "..." : formatCount(value);
    }
    for (const target of routeCountValues) {
      const key = target.dataset.routeCountKey;
      const value = key ? metricValues.get(key) : undefined;
      target.textContent = value === undefined ? "..." : formatCount(value);
    }
  } catch {
    for (const target of countValues) {
      target.textContent = "unavailable";
    }
    for (const target of routeCountValues) {
      target.textContent = "unavailable";
    }
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  void startQuery();
});

const routeSelect = form?.elements.namedItem("route");
if (routeSelect instanceof HTMLSelectElement) {
  routeSelect.addEventListener("change", () => {
    void startQuery();
  });
}

pageFirst?.addEventListener("click", () => {
  renderCachedPage(0);
});

pagePrev?.addEventListener("click", () => {
  renderCachedPage(Math.max(0, activePageIndex - 1));
});

pageNext?.addEventListener("click", () => {
  void goToNextPage();
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
      void startQuery();
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
      void startQuery();
    }
  });
}

syncRouteControls(activePath);
void loadApiStatus();
void loadCounts();
void startQuery().finally(() => {
  window.setTimeout(() => {
    void loadOperations();
  }, 250);
});
