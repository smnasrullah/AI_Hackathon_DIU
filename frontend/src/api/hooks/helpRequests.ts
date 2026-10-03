import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { qk } from "../keys";
import {
  cancelHelpRequest,
  claimHelpRequest,
  confirmHelpRequest,
  confirmLateHelpRequest,
  declineHelpRequest,
  dryRunHelp,
  getDemoHelp,
  getHelpOptOut,
  getHelpRequest,
  getHelpSettings,
  getTriggerSettings,
  listAgentProfiles,
  listAllHelpRequests,
  listHelpInbox,
  listMyHelpRequests,
  putHelpOptOut,
  putHelpSettings,
  putTriggerSettings,
  resetDemoHelp,
  runHelpTrigger,
  simulateShortage,
  withdrawHelpRequest,
} from "../services/helpRequests";
import type { HelpNoteIn, HelpRequestListQuery, HelpRequestPage, HelpSettingsIn, SimulateIn, TriggerSettingsIn } from "../types";

/** Live enough for "someone accepted": the page refetches every 12 s while the tab is visible. */
export const HELP_POLL_MS = 12_000;

export function useMyHelpRequests(q: HelpRequestListQuery = {}, enabled = true) {
  return useQuery({
    queryKey: qk.help.mine(q),
    queryFn: () => listMyHelpRequests(q),
    refetchInterval: HELP_POLL_MS,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useHelpInbox(q: HelpRequestListQuery = {}, enabled = true) {
  return useQuery({
    queryKey: qk.help.inbox(q),
    queryFn: () => listHelpInbox(q),
    refetchInterval: HELP_POLL_MS,
    placeholderData: keepPreviousData,
    enabled,
  });
}

type PageQ = Omit<HelpRequestListQuery, "page">;

function nextPage(last: HelpRequestPage): number | undefined {
  return last.page * last.page_size < last.total ? last.page + 1 : undefined;
}

/** "Load more" lists: page after page, all loaded pages refreshed on the same 12 s poll. */
export function useMyHelpRequestPages(q: PageQ = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.help.mine(q), "pages"],
    queryFn: ({ pageParam }) => listMyHelpRequests({ ...q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    refetchInterval: HELP_POLL_MS,
  });
}

export function useHelpInboxPages(q: PageQ = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.help.inbox(q), "pages"],
    queryFn: ({ pageParam }) => listHelpInbox({ ...q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    refetchInterval: HELP_POLL_MS,
  });
}

export function useHelpRequest(id: number) {
  return useQuery({
    queryKey: qk.help.item(id),
    queryFn: () => getHelpRequest(id),
    refetchInterval: HELP_POLL_MS,
  });
}

/** After any change to a request, every help list and the one detail refresh. */
function useHelpAction<A>(fn: (args: A) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: qk.help.all }),
  });
}

export function useClaimHelp() {
  return useHelpAction((id: number) => claimHelpRequest(id));
}

export function useDeclineHelp() {
  return useHelpAction(({ id, body }: { id: number; body?: HelpNoteIn }) => declineHelpRequest(id, body));
}

export function useWithdrawHelp() {
  return useHelpAction(({ id, body }: { id: number; body?: HelpNoteIn }) => withdrawHelpRequest(id, body));
}

export function useConfirmHelp() {
  return useHelpAction(({ id, body }: { id: number; body?: HelpNoteIn }) => confirmHelpRequest(id, body));
}

export function useConfirmLateHelp() {
  return useHelpAction(({ id, body }: { id: number; body?: HelpNoteIn }) => confirmLateHelpRequest(id, body));
}

export function useCancelHelp() {
  return useHelpAction(({ id, body }: { id: number; body?: HelpNoteIn }) => cancelHelpRequest(id, body));
}

// --- admin -----------------------------------------------------------------------------------

export function useAdminHelpRequests(q: HelpRequestListQuery = {}) {
  return useQuery({ queryKey: qk.help.admin(q), queryFn: () => listAllHelpRequests(q), placeholderData: keepPreviousData });
}

export function useHelpSettings() {
  return useQuery({ queryKey: qk.help.settings, queryFn: getHelpSettings });
}

export function useSaveHelpSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: HelpSettingsIn) => putHelpSettings(body),
    onSuccess: (data) => client.setQueryData(qk.help.settings, data),
  });
}

export function useTriggerSettings() {
  return useQuery({ queryKey: qk.help.trigger, queryFn: getTriggerSettings });
}

export function useSaveTriggerSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: TriggerSettingsIn) => putTriggerSettings(body),
    onSuccess: (data) => client.setQueryData(qk.help.trigger, data),
  });
}

export function useDryRun() {
  return useMutation({ mutationFn: (agentIds: number[] | null) => dryRunHelp(agentIds) });
}

export function useSimulateShortage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: SimulateIn) => simulateShortage(body),
    onSettled: () => client.invalidateQueries({ queryKey: qk.help.all }),
  });
}

export function useHelpOptOut(enabled: boolean) {
  return useQuery({ queryKey: qk.help.optOut, queryFn: getHelpOptOut, enabled });
}

export function useSetHelpOptOut() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (optedOut: boolean) => putHelpOptOut(optedOut),
    onSuccess: (data) => client.setQueryData(qk.help.optOut, data),
  });
}

export function useRunHelpTrigger() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: runHelpTrigger,
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.help.all });
      void client.invalidateQueries({ queryKey: qk.admin.overview });
    },
  });
}

export function useDemoHelp(enabled: boolean) {
  return useQuery({ queryKey: qk.help.demo, queryFn: getDemoHelp, enabled });
}

export function useResetDemoHelp() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: resetDemoHelp,
    onSettled: () => client.invalidateQueries({ queryKey: qk.help.all }),
  });
}

export function useAgentProfiles(enabled = true) {
  return useQuery({ queryKey: qk.help.agents, queryFn: listAgentProfiles, enabled, staleTime: 300_000 });
}

