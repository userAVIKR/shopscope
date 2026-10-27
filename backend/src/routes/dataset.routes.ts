import { Router } from "express";
import * as datasets from "../controllers/dataset.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const datasetRouter = Router();

datasetRouter.use(requireAuth);
datasetRouter.get("/", datasets.list);
datasetRouter.get("/:id/schema", datasets.schema);
