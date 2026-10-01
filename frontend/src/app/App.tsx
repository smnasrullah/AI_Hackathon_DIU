import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";

import { AuthBootstrap } from "../features/auth/AuthBootstrap";
import { BootstrapGate } from "../features/shared/BootstrapGate";
import { queryClient } from "../lib/queryClient";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BootstrapGate>
        <AuthBootstrap>
          <RouterProvider router={router} />
        </AuthBootstrap>
      </BootstrapGate>
    </QueryClientProvider>
  );
}
