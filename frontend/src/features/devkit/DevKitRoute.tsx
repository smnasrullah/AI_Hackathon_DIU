import { lazy, Suspense } from "react";

import { PulseLine } from "../../components/signature/PulseLine";

// Split out so the kit (and everything only it uses) stays out of the main bundle.
const DevKitPage = lazy(() => import("./DevKitPage").then((m) => ({ default: m.DevKitPage })));

export function DevKitRoute() {
  return (
    <Suspense fallback={<PulseLine mode="loader" className="mx-auto mt-24 max-w-xs" />}>
      <DevKitPage />
    </Suspense>
  );
}
