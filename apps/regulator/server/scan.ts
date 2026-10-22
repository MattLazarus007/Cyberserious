import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export type ScanVerdict =
  | { state: "clean" }
  | { state: "infected"; signature: string }
  | { state: "unavailable"; reason: string };

export interface ScanOptions {
  clamdscan?: string;
  config?: string;
  timeoutMs?: number;
}

export async function scanBuffer(bytes: Buffer, options: ScanOptions = {}): Promise<ScanVerdict> {
  const clamdscan = options.clamdscan ?? process.env.CLAMDSCAN ?? "/opt/homebrew/bin/clamdscan";
  const config = options.config ?? process.env.CLAMAV_CONF ?? join(process.cwd(), "data", "clamav", "clamd.conf");
  const timeout = options.timeoutMs ?? Number(process.env.CLAMAV_TIMEOUT_MS ?? 15_000);

  let dir: string;
  try {
    dir = mkdtempSync(join(tmpdir(), "cyberserious-scan-"));
  } catch (err) {
    return { state: "unavailable", reason: err instanceof Error ? err.message : "temp dir failed" };
  }
  const file = join(dir, "sample.bin");
  try {
    writeFileSync(file, bytes, { mode: 0o600 });
    const { stdout } = await run(clamdscan, ["--config-file", config, "--fdpass", "--no-summary", file], {
      timeout,
      maxBuffer: 1024 * 1024,
    });
    void stdout;
    return { state: "clean" };
  } catch (err) {
    const error = err as { code?: number; stdout?: string; stderr?: string; killed?: boolean; message?: string };
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (output.includes("FOUND")) {
      const match = output.match(/:\s*(.+?)\s+FOUND/);
      return { state: "infected", signature: match ? match[1] : "unknown" };
    }
    if (error.killed) {
      return { state: "unavailable", reason: "scanner timed out" };
    }
    return { state: "unavailable", reason: (error.message ?? "scanner failed").slice(0, 200) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
