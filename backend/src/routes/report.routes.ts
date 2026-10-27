import { Router } from "express";
import * as reports from "../controllers/report.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const reportRouter = Router();

reportRouter.use(requireAuth);
reportRouter.post("/", reports.create);
reportRouter.get("/", reports.list);
reportRouter.get("/:id", reports.get);
reportRouter.post("/:id/run", reports.run);
reportRouter.delete("/:id", reports.remove);
