import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export function query(text: string, params: unknown[] = []): Promise<pg.QueryResult> {
  return pool.query(text, params as unknown[]);
}

export async function withTransaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
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
  return pool.end();
}
