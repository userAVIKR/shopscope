import { z } from "zod";
import { reportSchema, resultSchema } from "@/types/api";
import { apiRequest, apiRequestNoContent } from "./api-client";

export const listReports = () =>
  apiRequest("/reports", z.object({ reports: z.array(reportSchema) }).transform((r) => r.reports));

// Reports are made from a query in history; the backend copies its SQL. No SQL is ever sent from here.
export const createReport = (queryId: string, name: string) =>
  apiRequest("/reports", z.object({ report: reportSchema }).transform((r) => r.report), {
    method: "POST",
    body: { queryId, name },
  });

export const runReport = (id: string) =>
  apiRequest(`/reports/${encodeURIComponent(id)}/run`, z.object({ report: reportSchema, result: resultSchema }), {
    method: "POST",
  });

export const deleteReport = (id: string) => apiRequestNoContent(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" });
