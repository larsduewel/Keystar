import { auditLog, getDb, type Db } from "@/core/db";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface AuditEntry {
  actorUserId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string | number;
  details?: Record<string, unknown>;
}

/** Best-effort audit writes that failed in this process since it started; System Info warns about them. */
export interface AuditFailures {
  count: number;
  lastAt: string | null;
  lastAction: string | null;
}

// Survive Next.js dev hot reloads, like the database pool.
const globalForAudit = globalThis as unknown as { __keystarAuditFailures?: AuditFailures };

function failures(): AuditFailures {
  globalForAudit.__keystarAuditFailures ??= { count: 0, lastAt: null, lastAction: null };
  return globalForAudit.__keystarAuditFailures;
}

export function auditFailures(): AuditFailures {
  return { ...failures() };
}

function row(entry: AuditEntry) {
  return {
    actorUserId: entry.actorUserId ?? null,
    actorName: entry.actorName ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId === undefined ? null : String(entry.targetId),
    details: entry.details ?? null,
  };
}

/**
 * Records an action as part of the caller's transaction, so the change and its
 * audit row commit or roll back together. Throws when the insert fails. Use it
 * for role and access changes, settings and scope switches.
 */
export async function auditInTx(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values(row(entry));
}

/**
 * Records an administrative or security-relevant action. Never throws: a failed
 * insert is logged and counted (see `auditFailures`), so the action that already
 * happened isn't reported as failed.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getDb().insert(auditLog).values(row(entry));
  } catch (err) {
    const f = failures();
    f.count++;
    f.lastAt = new Date().toISOString();
    f.lastAction = entry.action;
    console.error("Failed to write audit log entry", entry.action, err);
  }
}
