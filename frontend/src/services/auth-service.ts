import { z } from "zod";
import { userSchema, type User } from "@/types/api";
import { apiRequest, apiRequestNoContent } from "./api-client";

const userResponse = z.object({ user: userSchema }).transform((r) => r.user);

export const getMe = (): Promise<User> => apiRequest("/auth/me", userResponse);

export const login = (email: string, password: string): Promise<User> =>
  apiRequest("/auth/login", userResponse, { method: "POST", body: { email, password } });

export const register = (name: string, email: string, password: string): Promise<User> =>
  apiRequest("/auth/register", userResponse, { method: "POST", body: { name, email, password } });

export const logout = (): Promise<void> => apiRequestNoContent("/auth/logout", { method: "POST" });
