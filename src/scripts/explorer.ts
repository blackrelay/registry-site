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

const apiBase = document.documentElement.dataset.apiBase ?? "https://api.blackrelay.network";
const form = document.querySelector<HTMLFormElement>("[data-explorer-form]");
const results = document.querySelector<HTMLElement>("[data-results]");
const resultsSummary = document.querySelector<HTMLElement>("[data-results-summary]");
const detail = document.querySelector<HTMLElement>("[data-detail]");
const loadMore = document.querySelector<HTMLButtonElement>("[data-load-more]");
const copyDetail = document.querySelector<HTMLButtonElement>("[data-copy-detail]");
const readySummary = document.querySelector<HTMLElement>("[data-ready-summary]");
const readyJSON = document.querySelector<HTMLElement>("[data-ready-json]");
const freshnessJSON = document.querySelector<HTMLElement>("[data-freshness-json]");
const sourceGapsJSON = document.querySelector<HTMLElement>("[data-source-gaps-json]");

let activeCursor: string | undefined;
let activePath = "/v1/search";
let activeDetailJSON = "";

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
  const response = await fetch(endpoint(path, params), {
    headers: {
      accept: "application/json",
    },
  });
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Request failed with ${response.status}`);
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
    if (typeof value === "number") {
      return String(value);
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

function recordMeta(record: UnknownRecord): string {
  const parts = [
    firstString(record.environment),
    firstString(record.cycle ? `cycle ${record.cycle}` : ""),
    firstString(record.confidence),
    firstString(record.sourceKind),
    firstString(record.occurredAt, record.timestamp, record.createdAt),
  ].filter(Boolean);
  return parts.length ? parts.join(" // ") : recordId(record);
}

function renderError(message: string): void {
  if (resultsSummary) {
    resultsSummary.textContent = message;
  }
  if (results) {
    results.innerHTML = "";
  }
  if (loadMore) {
    loadMore.hidden = true;
  }
}

function renderRecords(records: unknown[], append = false): void {
  if (!results || !resultsSummary) {
    return;
  }
  if (!append) {
    results.innerHTML = "";
  }
  resultsSummary.textContent = `${records.length} record(s) returned from ${activePath}.`;
  for (const value of records) {
    const record = asRecord(value);
    const id = recordId(record);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "result-card";
    card.dataset.recordId = id;
    card.dataset.recordType = recordType(record);
    card.innerHTML = `
      <span>${escapeHTML(recordType(record))}</span>
      <strong>${escapeHTML(recordTitle(record))}</strong>
      <small>${escapeHTML(recordMeta(record))}</small>
    `;
    card.addEventListener("click", () => showDetail(record));
    results.append(card);
  }
}

async function runQuery(cursor?: string): Promise<void> {
  if (!form) {
    return;
  }
  const data = new FormData(form);
  activePath = String(data.get("route") ?? "/v1/search");
  if (resultsSummary) {
    resultsSummary.textContent = "Querying public API...";
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

  for (const [path, target] of targets) {
    try {
      const body = await fetchEnvelope<unknown>(path);
      if (target) {
        target.textContent = JSON.stringify(body.data ?? body, null, 2);
      }
      if (path === "/v1/ready" && readySummary) {
        const ready = asRecord(body.data);
        readySummary.textContent = `API readiness: ${firstString(ready.status, "unknown")}.`;
      }
    } catch (error) {
      if (target) {
        target.textContent = error instanceof Error ? error.message : String(error);
      }
      if (path === "/v1/ready" && readySummary) {
        readySummary.textContent = "API readiness signal unavailable.";
      }
    }
  }
}

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  void runQuery();
});

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

for (const shortcut of document.querySelectorAll<HTMLButtonElement>("[data-route-shortcut]")) {
  shortcut.addEventListener("click", () => {
    if (!form) {
      return;
    }
    const route = shortcut.dataset.routeShortcut;
    const select = form.elements.namedItem("route");
    if (route && select instanceof HTMLSelectElement) {
      select.value = route;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      void runQuery();
    }
  });
}

void loadOperations();
void runQuery();
