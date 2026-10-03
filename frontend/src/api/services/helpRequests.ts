import { api } from "../../lib/api";
import type {
  AgentProfile,
  DemoHelpInfo,
  DemoResetOut,
  DryRunOut,
  HelpNoteIn,
  HelpRequestItem,
  HelpRequestListQuery,
  HelpRequestPage,
  HelpSettingsIn,
  HelpSettingsOut,
  HelpSweepOut,
  SimulateIn,
  SimulateOut,
  TriggerSettingsIn,
  TriggerSettingsOut,
} from "../types";

const BASE = "/liquidity-requests";
const ADMIN = "/admin/liquidity-requests";

/** Requests I asked for (agent) or my agents asked for (distributor). */
export async function listMyHelpRequests(params: HelpRequestListQuery = {}): Promise<HelpRequestPage> {
  return (await api.get<HelpRequestPage>(`${BASE}/mine`, { params })).data;
}

/** Requests addressed to me, with the amount, area and deadline only. */
export async function listHelpInbox(params: HelpRequestListQuery = {}): Promise<HelpRequestPage> {
  return (await api.get<HelpRequestPage>(`${BASE}/inbox`, { params })).data;
}

export async function getHelpRequest(id: number): Promise<HelpRequestItem> {
  return (await api.get<HelpRequestItem>(`${BASE}/${id}`)).data;
}

/** I can help. Throws a 409 with detail "already_taken" when someone else got there first. */
export async function claimHelpRequest(id: number): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/claim`)).data;
}

export async function declineHelpRequest(id: number, body: HelpNoteIn = {}): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/decline`, body)).data;
}

export async function withdrawHelpRequest(id: number, body: HelpNoteIn = {}): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/withdraw`, body)).data;
}

export async function confirmHelpRequest(id: number, body: HelpNoteIn = {}): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/confirm`, body)).data;
}

/** The helper whose claim timed out delivered after all (reopened requests that had such a claim). */
export async function confirmLateHelpRequest(id: number, body: HelpNoteIn = {}): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/confirm-late`, body)).data;
}

export async function cancelHelpRequest(id: number, body: HelpNoteIn = {}): Promise<HelpRequestItem> {
  return (await api.post<HelpRequestItem>(`${BASE}/${id}/cancel`, body)).data;
}

// --- admin -----------------------------------------------------------------------------------

export async function listAllHelpRequests(params: HelpRequestListQuery = {}): Promise<HelpRequestPage> {
  return (await api.get<HelpRequestPage>(ADMIN, { params })).data;
}

export async function getHelpSettings(): Promise<HelpSettingsOut> {
  return (await api.get<HelpSettingsOut>(`${ADMIN}/settings`)).data;
}

export async function putHelpSettings(body: HelpSettingsIn): Promise<HelpSettingsOut> {
  return (await api.put<HelpSettingsOut>(`${ADMIN}/settings`, body)).data;
}

export async function getTriggerSettings(): Promise<TriggerSettingsOut> {
  return (await api.get<TriggerSettingsOut>(`${ADMIN}/trigger-settings`)).data;
}

export async function putTriggerSettings(body: TriggerSettingsIn): Promise<TriggerSettingsOut> {
  return (await api.put<TriggerSettingsOut>(`${ADMIN}/trigger-settings`, body)).data;
}

/** Writes nothing and sends nothing: shows who would get a request right now. */
export async function dryRunHelp(agentIds: number[] | null): Promise<DryRunOut> {
  return (await api.post<DryRunOut>(`${ADMIN}/dry-run`, { agent_ids: agentIds })).data;
}

/** DEMO_MODE only: forces one agent into a 30-minute shortage and runs the helper search now. */
export async function simulateShortage(body: SimulateIn): Promise<SimulateOut> {
  return (await api.post<SimulateOut>(`${ADMIN}/simulate-shortage`, body)).data;
}

/** What DEMO_MODE changes for help requests (read-only). */
export async function getDemoHelp(): Promise<DemoHelpInfo> {
  return (await api.get<DemoHelpInfo>(`${ADMIN}/demo`)).data;
}

/** DEMO_MODE only: cancels the demo agents' open requests and restarts their limits. */
export async function resetDemoHelp(): Promise<DemoResetOut> {
  return (await api.post<DemoResetOut>(`${ADMIN}/demo-reset`)).data;
}

export async function sweepHelpRequests(): Promise<HelpSweepOut> {
  return (await api.post<HelpSweepOut>(`${ADMIN}/sweep`)).data;
}

/** Agents in scope for the admin picker. */
export async function listAgentProfiles(): Promise<AgentProfile[]> {
  return (await api.get<AgentProfile[]>("/agents")).data;
}
