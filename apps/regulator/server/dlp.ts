import { query } from "./db.ts";

function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const EXPORT_ROW_LIMIT = envLimit("EXPORT_ROW_LIMIT", 5000);
export const EXPORT_BYTE_LIMIT = envLimit("EXPORT_BYTE_LIMIT", 5 * 1024 * 1024);

const PATTERNS = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phone: /(?:\+27|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g,
  idNumber: /\b\d{13}\b/g,
};

export function withinExportCap(rows: number): boolean {
  return rows <= EXPORT_ROW_LIMIT;
}

export function piiCounts(value: unknown): Record<string, number> {
  const text = JSON.stringify(value ?? {});
  const counts: Record<string, number> = {};
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    counts[name] = (text.match(pattern) ?? []).length;
  }
  return counts;
}

export interface ExportManifest {
  id: number;
  actor: string;
  kind: string;
  resource: string;
  rows: number;
  bytes: number;
  pii: Record<string, number>;
  destination: string;
  createdAt: string;
}

export async function recordExport(input: {
  actor: string;
  kind: string;
  resource: string;
  body: unknown;
  destination?: string;
  rows?: number;
}): Promise<ExportManifest> {
  const rows = input.rows ?? 1;
  if (!withinExportCap(rows)) {
    throw Object.assign(new Error("export exceeds the row cap"), { status: 413 });
  }
  const body = JSON.stringify(input.body ?? {});
  if (Buffer.byteLength(body) > EXPORT_BYTE_LIMIT) {
    throw Object.assign(new Error("export exceeds the size cap"), { status: 413 });
  }
  const done = await query(
    `insert into export_manifests (actor, kind, resource, row_count, byte_count, pii, destination)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
     returning id::int, actor, kind, resource, row_count as rows, byte_count as bytes, pii,
               destination, created_at as "createdAt"`,
    [input.actor, input.kind, input.resource, rows, Buffer.byteLength(body), JSON.stringify(piiCounts(input.body)), input.destination ?? "browser download"]
  );
  return done.rows[0] as ExportManifest;
}

export async function recentExports(limit = 10): Promise<ExportManifest[]> {
  const rows = await query(
    `select id::int, actor, kind, resource, row_count as rows, byte_count as bytes, pii,
            destination, created_at as "createdAt"
       from export_manifests order by created_at desc limit $1`,
    [limit]
  );
  return rows.rows as ExportManifest[];
}
