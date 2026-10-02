// Custom animated SVGs for empty and error states (DESIGN.md §3.15). No stock art.
// Loops use .ap-loop so reduced motion and off-screen pausing apply.

export type IllustrationKind = "cracked-vessel" | "empty-runway" | "quiet-pulse";

const LINE = "var(--line-strong)";

function CrackedVessel() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <ellipse cx="80" cy="108" rx="44" ry="5" fill="var(--line)" />
      <path d="M52 22 h56 v14 c10 8 14 18 14 30 v24 a14 14 0 0 1 -14 14 h-56 a14 14 0 0 1 -14 -14 v-24 c0 -12 4 -22 14 -30 z" fill="var(--surface)" stroke={LINE} strokeWidth="2.5" />
      <path d="M40 82 h80 v8 a14 14 0 0 1 -14 14 h-52 a14 14 0 0 1 -14 -14 z" fill="var(--float-cash)" opacity="0.22" />
      <path d="M94 36 l-8 14 l9 6 l-11 16" fill="none" stroke="var(--risk-act)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <g className="ap-loop ap-drip">
        <path d="M84 74 c-3 5 -4 7 -4 9 a4 4 0 0 0 8 0 c0 -2 -1 -4 -4 -9 z" fill="var(--float-cash)" opacity="0.7" />
      </g>
    </svg>
  );
}

function EmptyRunway() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <path d="M20 100 L64 20 h32 L140 100 z" fill="var(--surface-2)" stroke={LINE} strokeWidth="2" />
      <path d="M80 28 v10 M80 48 v12 M80 70 v14" stroke="var(--line-strong)" strokeWidth="3" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <circle cx={58 - i * 10} cy={36 + i * 20} r="3" fill="var(--upay-yellow)" className="ap-loop ap-blink" style={{ animationDelay: `${i * 0.3}s` }} />
          <circle cx={102 + i * 10} cy={36 + i * 20} r="3" fill="var(--upay-yellow)" className="ap-loop ap-blink" style={{ animationDelay: `${i * 0.3}s` }} />
        </g>
      ))}
    </svg>
  );
}

function QuietPulse() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <rect x="16" y="24" width="128" height="72" rx="18" fill="var(--surface)" stroke={LINE} strokeWidth="2" />
      <path d="M28 60 H70 L76 52 L82 66 L88 60 H132" fill="none" stroke="var(--risk-safe)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="132" cy="60" r="4" fill="var(--risk-safe)" />
      <circle cx="132" cy="60" r="4" fill="none" stroke="var(--risk-safe)" className="ap-loop ap-ping" />
    </svg>
  );
}

export function Illustration({ kind }: { kind: IllustrationKind }) {
  if (kind === "cracked-vessel") return <CrackedVessel />;
  if (kind === "empty-runway") return <EmptyRunway />;
  return <QuietPulse />;
}
