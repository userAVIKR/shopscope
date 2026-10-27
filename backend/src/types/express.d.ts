import type { PublicUser } from "../services/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth for every protected route.
      user?: PublicUser;
    }
  }
}

export {};
