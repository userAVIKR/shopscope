import { prisma } from "../config/database.js";
import { HttpError } from "../utils/http-error.js";
import { runSavedSql } from "./query.service.js";

const reportSelect = {
  id: true,
  queryId: true,
  datasetId: true,
  name: true,
  question: true,
  sql: true,
  createdAt: true,
  updatedAt: true,
} as const;

// A report is created from one of the user's own successful queries. The SQL is copied from history,
// never accepted from the client, so a report can only contain SQL that ShopScope generated and validated.
export async function createReport(userId: string, input: { queryId: string; name: string }) {
  const query = await prisma.queryHistory.findFirst({ where: { id: input.queryId, userId } });
  if (!query) throw new HttpError(404, "HISTORY_NOT_FOUND", "Query not found");
  if (query.status !== "SUCCEEDED" || !query.generatedSql) {
    throw new HttpError(422, "QUERY_NOT_SAVABLE", "Only successful queries can be saved as reports");
  }

  return prisma.savedReport.create({
    data: { userId, queryId: query.id, datasetId: query.datasetId, name: input.name, question: query.question, sql: query.generatedSql },
    select: reportSelect,
  });
}

export async function listReports(userId: string) {
  return prisma.savedReport.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: reportSelect });
}

// Another user's report gives the same 404 as a missing one.
export async function getReport(userId: string, id: string) {
  const report = await prisma.savedReport.findFirst({ where: { id, userId }, select: reportSelect });
  if (!report) throw new HttpError(404, "REPORT_NOT_FOUND", "Report not found");
  return report;
}

export async function deleteReport(userId: string, id: string) {
  const { count } = await prisma.savedReport.deleteMany({ where: { id, userId } });
  if (count === 0) throw new HttpError(404, "REPORT_NOT_FOUND", "Report not found");
}

// Reopens a report with fresh data. The stored SQL is validated again before it runs.
export async function runReport(userId: string, id: string) {
  const report = await getReport(userId, id);
  const result = await runSavedSql(report.sql, report.datasetId);
  return { report, result };
}
