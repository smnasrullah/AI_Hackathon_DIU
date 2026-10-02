import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";

import { PublicLayout } from "../../app/layouts/PublicLayout";
import { PulseLine } from "../../components/signature/PulseLine";
import { useAuthStore } from "./authStore";
import { ROLE_HOME } from "./types";

// Route-split: the landing chunk loads only for signed-out visitors.
const LandingPage = lazy(() => import("../landing/LandingPage").then((m) => ({ default: m.LandingPage })));

/** `/`: role home when signed in, else the public landing page. */
export function HomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;
  return (
    <PublicLayout width="full">
      <Suspense
        fallback={
          <div className="mx-auto grid min-h-[70vh] w-40 place-items-center">
            <PulseLine mode="loader" />
          </div>
        }
      >
        <LandingPage />
      </Suspense>
    </PublicLayout>
  );
}
