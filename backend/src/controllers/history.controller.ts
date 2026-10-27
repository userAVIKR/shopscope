import type { RequestHandler } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.middleware.js";
import { getHistoryItem, listHistory } from "../services/history.service.js";

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.uuid().optional(),
});

const idSchema = z.object({ id: z.uuid({ error: "Invalid id" }) });

export const list: RequestHandler = async (req, res) => {
  res.json(await listHistory(currentUser(req).id, listSchema.parse(req.query)));
};

export const get: RequestHandler = async (req, res) => {
  const { id } = idSchema.parse(req.params);
  res.json({ item: await getHistoryItem(currentUser(req).id, id) });
};
