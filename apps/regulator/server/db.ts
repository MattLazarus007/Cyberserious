import pg from "pg";

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export function query(text: string, params: unknown[] = []): Promise<pg.QueryResult> {
  return getPool().query(text, params as unknown[]);
}

export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const out = await work(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export function closePool(): Promise<void> {
  if (!pool) return Promise.resolve();
  const ending = pool.end();
  pool = null;
  return ending;
}
