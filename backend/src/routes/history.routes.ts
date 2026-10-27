import { Router } from "express";
import * as history from "../controllers/history.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const historyRouter = Router();

historyRouter.use(requireAuth);
historyRouter.get("/", history.list);
historyRouter.get("/:id", history.get);
