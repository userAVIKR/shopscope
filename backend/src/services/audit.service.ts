import { prisma } from "../config/database.js";

export type AuditEventType = "auth.register" | "auth.login.succeeded" | "auth.login.failed" | "auth.logout";

export async function recordAuditEvent(
  type: AuditEventType,
  details: { userId?: string | null | undefined; ip?: string | undefined; metadata?: Record<string, string | number | boolean> },
): Promise<void> {
  await prisma.auditEvent.create({
    data: { type, userId: details.userId ?? null, ip: details.ip ?? null, metadata: details.metadata },
  });
}
