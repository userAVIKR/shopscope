import type { RequestHandler } from "express";
import { z } from "zod";
import { DEFAULT_DATASET_ID, getDataset } from "../analytics/schema.service.js";
import { currentUser } from "../middleware/auth.middleware.js";
import { askQuestion } from "../services/query.service.js";

const askSchema = z.object({
  question: z.string().trim().min(3, "Question is too short").max(500, "Question must be 500 characters or fewer"),
  datasetId: z.string().default(DEFAULT_DATASET_ID),
});

// Always 200 for a handled outcome (succeeded, unanswerable, rejected, failed): the `status` field says which.
// Model and infrastructure failures (e.g. Ollama down) are HTTP errors from the error handler.
export const ask: RequestHandler = async (req, res) => {
  const input = askSchema.parse(req.body);
  getDataset(input.datasetId); // 404 for an unknown dataset
  res.json(await askQuestion(currentUser(req).id, input));
};
