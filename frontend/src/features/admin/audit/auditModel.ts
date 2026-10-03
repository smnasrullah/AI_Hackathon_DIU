import type { AuditQuery } from "../../../api/types";

export interface AuditUrlState {
  action: string;
  entity: string;
  user: string;
  /** "YYYY-MM-DD", whole Dhaka days. */
  from: string;
  to: string;
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** URL state -> API filter: Dhaka calendar days become [from 00:00, to+1 00:00) at +06:00. */
export function auditQuery(s: AuditUrlState): AuditQuery {
  const q: AuditQuery = {};
  if (s.action) q.action = s.action;
  if (s.entity) q.entity_type = s.entity;
  if (s.user) q.user = s.user;
  if (s.from) q.from = `${s.from}T00:00:00+06:00`;
  if (s.to) q.to = `${nextDay(s.to)}T00:00:00+06:00`;
  return q;
}

/** Stored payload JSON, indented for reading (falls back to the raw text). */
export function prettyPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
