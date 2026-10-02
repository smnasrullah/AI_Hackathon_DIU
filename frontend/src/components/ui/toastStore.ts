import { create } from "zustand";

import { registerStoreReset } from "../../lib/storeRegistry";

export type ToastTone = "success" | "info" | "warning" | "error";

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
  /** ms before auto-dismiss; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

const MAX_VISIBLE = 4;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { duration: 5000, ...toast, id }].slice(-MAX_VISIBLE) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

registerStoreReset(() => useToastStore.setState({ toasts: [] }));

/** Show a toast from anywhere (mutation results, etc.). */
export const toast = (t: Parameters<ToastState["push"]>[0]): number => useToastStore.getState().push(t);
