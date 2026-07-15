import { config } from "../config.js";

// Minimal Grist REST client for the meeting-reminder store
// (docs/rappels-calendrier.md §3-4). Two tables:
//   - RappelsCalendrier : one row per registered user (inscription)
//   - RappelsEnvoyes    : anti-duplicate log of sent reminders
//
// Grist REST reference:
//   GET    /api/docs/{doc}/tables/{table}/records[?filter=...]
//   POST   /api/docs/{doc}/tables/{table}/records   {records:[{fields}]}
//   PATCH  /api/docs/{doc}/tables/{table}/records   {records:[{id,fields}]}
//   POST   /api/docs/{doc}/tables/{table}/data/delete   [rowId, ...]
// Auth: Bearer <API key>.

// A Grist record: numeric row `id` + arbitrary typed `fields`.
export interface GristRecord {
  id: number;
  fields: Record<string, unknown>;
}

export class GristError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GristError";
  }
}

function requireConfig(): { base: string; key: string; docId: string } {
  const { url, apiKey, docId } = config.grist;
  if (!apiKey || !docId) {
    throw new GristError(
      "Grist non configuré: GRIST_API_KEY / GRIST_DOC_ID manquants",
      0,
    );
  }
  return { base: `${url}/api`, key: apiKey, docId };
}

async function gristFetch(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const { base, key } = requireConfig();
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : String(body).slice(0, 300);
    throw new GristError(`Grist HTTP ${res.status}: ${detail}`, res.status);
  }
  return body;
}

// Encode Grist's `filter` query param: a JSON object mapping column → allowed
// values, e.g. {Statut: ["actif"]}. Grist matches records where the column is
// one of the listed values.
function filterParam(filter: Record<string, unknown[]>): string {
  return `?filter=${encodeURIComponent(JSON.stringify(filter))}`;
}

// List records from a table, optionally filtered by exact column values.
export async function listRecords(
  table: string,
  filter?: Record<string, unknown[]>,
): Promise<GristRecord[]> {
  const { docId } = requireConfig();
  const qs = filter ? filterParam(filter) : "";
  const body = (await gristFetch(
    `/docs/${docId}/tables/${encodeURIComponent(table)}/records${qs}`,
  )) as { records?: GristRecord[] };
  return body.records ?? [];
}

// Insert records; returns the new row ids.
export async function addRecords(
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<number[]> {
  const { docId } = requireConfig();
  const body = (await gristFetch(
    `/docs/${docId}/tables/${encodeURIComponent(table)}/records`,
    {
      method: "POST",
      body: JSON.stringify({ records: rows.map((fields) => ({ fields })) }),
    },
  )) as { records?: Array<{ id: number }> };
  return (body.records ?? []).map((r) => r.id);
}

// Patch existing records by row id.
export async function updateRecords(
  table: string,
  rows: Array<{ id: number; fields: Record<string, unknown> }>,
): Promise<void> {
  const { docId } = requireConfig();
  await gristFetch(
    `/docs/${docId}/tables/${encodeURIComponent(table)}/records`,
    {
      method: "PATCH",
      body: JSON.stringify({ records: rows }),
    },
  );
}

// Delete records by row id.
export async function deleteRecords(
  table: string,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  const { docId } = requireConfig();
  await gristFetch(
    `/docs/${docId}/tables/${encodeURIComponent(table)}/data/delete`,
    {
      method: "POST",
      body: JSON.stringify(ids),
    },
  );
}

// Simple connectivity check: returns the number of tables in the doc, or
// throws GristError. Used by a smoke-test script before wiring the flow.
export async function ping(): Promise<string[]> {
  const { docId } = requireConfig();
  const body = (await gristFetch(`/docs/${docId}/tables`)) as {
    tables?: Array<{ id: string }>;
  };
  return (body.tables ?? []).map((t) => t.id);
}
