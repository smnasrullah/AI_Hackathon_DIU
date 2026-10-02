import { useLocation } from "react-router-dom";

/** Test helper: prints the router's current path + query so tests can assert URL-synced state. */
export function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}
