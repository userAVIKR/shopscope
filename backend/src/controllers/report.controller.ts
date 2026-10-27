import type { RequestHandler } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.middleware.js";
import * as reports from "../services/report.service.js";

// No SQL field: reports are built from the user's own query history only.
const createSchema = z.object({
  queryId: z.uuid({ error: "Invalid query id" }),
  name: z.string().trim().min(1, "Name is required").max(120),
});

const idSchema = z.object({ id: z.uuid({ error: "Invalid id" }) });

export const create: RequestHandler = async (req, res) => {
  const input = createSchema.parse(req.body);
  res.status(201).json({ report: await reports.createReport(currentUser(req).id, input) });
};

export const list: RequestHandler = async (req, res) => {
  res.json({ reports: await reports.listReports(currentUser(req).id) });
};

export const get: RequestHandler = async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ report: await reports.getReport(currentUser(req).id, id) });
};

export const run: RequestHandler = async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json(await reports.runReport(currentUser(req).id, id));
};

export const remove: RequestHandler = async (req, res) => {
  const { id } = idSchema.parse(req.params);
  await reports.deleteReport(currentUser(req).id, id);
  res.status(204).end();
};
