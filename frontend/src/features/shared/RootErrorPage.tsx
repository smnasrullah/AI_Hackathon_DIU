import { Notices } from "./Notices";
import { ServerErrorPage } from "./StatusPages";

/** Router-level fallback when a whole layout fails; route pages have their own boundary. */
export function RootErrorPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <main className="flex-1 px-4 py-6">
        <ServerErrorPage onRetry={() => window.location.reload()} />
      </main>
      <Notices />
    </div>
  );
}
