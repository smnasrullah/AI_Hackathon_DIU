import { Columns2, Square } from "lucide-react";
import { useState } from "react";

import { MotionPrefs } from "../../components/ui/MotionPrefs";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ThemeToggle } from "../../components/ui/ThemeToggle";
import { Notices } from "../shared/Notices";
import { FeedbackSections } from "./FeedbackSections";
import { FoundationSections } from "./FoundationSections";
import { KitViewContext, type KitView } from "./kitData";
import { PrimitiveSections } from "./PrimitiveSections";
import { SignatureSections } from "./SignatureSections";
import { usePrefsStore } from "../../lib/prefs";

type MotionChoice = "system" | "on" | "off";

const MOTION_OVERRIDE: Record<MotionChoice, boolean | null> = { system: null, on: false, off: true };

/** Dev-only showcase of every design-system component in all states, both themes, motion on/off. */
export function DevKitPage() {
  const [view, setView] = useState<KitView>("single");
  const [motion, setMotion] = useState<MotionChoice>("system");
  const lang = usePrefsStore((s) => s.lang);
  const digits = usePrefsStore((s) => s.digits);
  const setLang = usePrefsStore((s) => s.setLang);
  const setDigits = usePrefsStore((s) => s.setDigits);

  return (
    <MotionPrefs reduced={MOTION_OVERRIDE[motion]}>
      <div className="min-h-screen bg-bg text-fg">
        <header className="glass sticky top-0 z-(--z-sticky) border-b border-line">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
            <div className="mr-auto">
              <p className="ap-eyebrow">Dev only</p>
              <p className="font-display text-h2 font-bold leading-none">Design kit</p>
            </div>
            <SegmentedControl
              label="Theme layout"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: "single", label: "Current theme", icon: Square },
                { value: "both", label: "Both themes", icon: Columns2 },
              ]}
            />
            <SegmentedControl
              label="Motion"
              size="sm"
              value={motion}
              onChange={setMotion}
              options={[
                { value: "system", label: "Motion: system" },
                { value: "on", label: "On" },
                { value: "off", label: "Reduced" },
              ]}
            />
            <SegmentedControl label="Language" size="sm" value={lang} onChange={setLang} options={[{ value: "bn", label: "বাংলা" }, { value: "en", label: "English" }]} />
            <SegmentedControl label="Digits" size="sm" value={digits} onChange={setDigits} options={[{ value: "bn", label: "১২৩" }, { value: "en", label: "123" }]} />
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-12 px-4 py-8">
          <KitViewContext.Provider value={view}>
            <FoundationSections />
            <PrimitiveSections />
            <SignatureSections />
            <FeedbackSections />
          </KitViewContext.Provider>
        </main>
        <Notices />
      </div>
    </MotionPrefs>
  );
}
