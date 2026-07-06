import { sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import type { DomainConfig } from "./types";
import { getDomainConfig } from "./registry";

function getResultRows(rows: unknown): Record<string, unknown>[] {
  return (rows as { rows?: Record<string, unknown>[] }).rows
    ?? (rows as Record<string, unknown>[]);
}

export async function getCurrentUserDomainId(
  userId?: string,
): Promise<string> {
  const resolvedUserId = userId ?? await getCurrentUserId();

  try {
    const rows = await db.execute(sql`
      SELECT domain
      FROM users
      WHERE id = ${resolvedUserId}
      LIMIT 1
    `);

    const row = getResultRows(rows)[0];
    const domainId = typeof row?.domain === "string" ? row.domain : null;

    return domainId || "medicine";
  } catch {
    // The users.domain column may not exist yet on all environments.
    return "medicine";
  }
}

export async function getCurrentUserDomainConfig(
  userId?: string,
): Promise<DomainConfig> {
  return getDomainConfig(await getCurrentUserDomainId(userId));
}
