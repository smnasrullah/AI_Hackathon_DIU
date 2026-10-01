import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { BootstrapGate } from "../features/shared/BootstrapGate";
import { router } from "./router";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BootstrapGate>
        <RouterProvider router={router} />
      </BootstrapGate>
    </QueryClientProvider>
  );
}
