import { LandingHero } from "./LandingHero";
import { LandingStory } from "./LandingStory";
import { RaiStrip } from "./RaiStrip";
import { RoleCards } from "./RoleCards";

/** Public `/` (signed out). Lazy chunk: the signed-in app never downloads it. */
export function LandingPage() {
  return (
    <div className="overflow-x-clip" data-testid="landing">
      <LandingHero />
      <LandingStory />
      <RoleCards />
      <RaiStrip />
    </div>
  );
}
