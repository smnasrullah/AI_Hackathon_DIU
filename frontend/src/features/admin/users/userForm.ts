import { z } from "zod";

import type { AdminUser, AdminUserCreate, AdminUserUpdate, UserRole } from "../../../api/types";

export const ROLES: UserRole[] = ["agent", "distributor", "admin"];
export const PASSWORD_MIN = 8;

export interface UserMessages {
  required: string;
  email: string;
  password: string;
  agent: string;
  distributor: string;
}

/** `creating`: the password is required only for a new user (edits never touch it). */
export function userSchema(m: UserMessages, creating: boolean) {
  return z
    .object({
      email: z.string().trim().min(1, m.required).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, m.email),
      full_name: z.string().trim().min(1, m.required).max(120),
      role: z.enum(["agent", "distributor", "admin"]),
      agent_id: z.string(),
      distributor_id: z.string(),
      password: creating ? z.string().min(PASSWORD_MIN, m.password).max(128) : z.string(),
    })
    .refine((v) => v.role !== "agent" || v.agent_id !== "", { path: ["agent_id"], message: m.agent })
    .refine((v) => v.role !== "distributor" || v.distributor_id !== "", { path: ["distributor_id"], message: m.distributor });
}

export type UserForm = z.infer<ReturnType<typeof userSchema>>;

export function formFromUser(u: AdminUser | null): UserForm {
  return {
    email: u?.email ?? "",
    full_name: u?.full_name ?? "",
    role: u?.role ?? "agent",
    agent_id: u?.agent_id ? String(u.agent_id) : "",
    distributor_id: u?.distributor_id ? String(u.distributor_id) : "",
    password: "",
  };
}

function links(f: UserForm): { agent_id: number | null; distributor_id: number | null } {
  return {
    agent_id: f.role === "agent" ? Number(f.agent_id) : null,
    distributor_id: f.role === "distributor" ? Number(f.distributor_id) : null,
  };
}

export function createBody(f: UserForm): AdminUserCreate {
  return { email: f.email.trim().toLowerCase(), full_name: f.full_name.trim(), role: f.role, password: f.password, ...links(f) };
}

/** Only what changed, so the audit log records a minimal before / after. */
export function updateBody(u: AdminUser, f: UserForm): AdminUserUpdate {
  const out: AdminUserUpdate = {};
  if (f.full_name.trim() !== u.full_name) out.full_name = f.full_name.trim();
  const next = links(f);
  const linkChanged = f.role === "agent" ? next.agent_id !== u.agent_id : f.role === "distributor" ? next.distributor_id !== u.distributor_id : false;
  if (f.role !== u.role || linkChanged) {
    out.role = f.role;
    if (f.role === "agent") out.agent_id = next.agent_id;
    if (f.role === "distributor") out.distributor_id = next.distributor_id;
  }
  return out;
}
