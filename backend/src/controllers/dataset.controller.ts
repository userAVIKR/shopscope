import type { RequestHandler } from "express";
import { getPublicSchema, listDatasets } from "../analytics/schema.service.js";

export const list: RequestHandler = (_req, res) => {
  res.json({ datasets: listDatasets() });
};

// Sensitive columns are already removed by getPublicSchema.
export const schema: RequestHandler = (req, res) => {
  res.json({ schema: getPublicSchema(String(req.params.id)) });
};
