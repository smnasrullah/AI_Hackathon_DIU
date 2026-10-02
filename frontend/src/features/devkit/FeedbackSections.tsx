import { ArrowLeftRight, ChartColumn, CircleCheck, House, Inbox, RefreshCw } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { LiquidButton } from "../../components/ui/LiquidButton";
import { MoneyText } from "../../components/ui/MoneyText";
import { RiskPill } from "../../components/ui/RiskPill";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SkeletonCard, SkeletonGauge, SkeletonRows, SkeletonRunway, SkeletonText } from "../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../components/ui/StatePanel";
import { Tabs } from "../../components/ui/Tabs";
import { TimeText } from "../../components/ui/TimeText";
import { toast } from "../../components/ui/toastStore";
import { KitSection, KitState } from "./KitFrame";
import { KIT_ROWS, type KitRow } from "./kitData";

const RISK_ORDER = { red: 0, amber: 1, green: 2 } as const;

const COLUMNS: Column<KitRow>[] = [
  { key: "code", header: "Code", cell: (r) => <span className="num">{r.code}</span>, sortValue: (r) => r.code },
  { key: "name", header: "Agent", cell: (r) => r.name, sortValue: (r) => r.name },
  { key: "district", header: "District", cell: (r) => r.district },
  { key: "risk", header: "Risk", cell: (r) => <RiskPill level={r.level} size="sm" />, sortValue: (r) => RISK_ORDER[r.level] },
  { key: "cash", header: "Cash", align: "right", cell: (r) => <MoneyText value={r.cash} />, sortValue: (r) => r.cash },
  { key: "hours", header: "Runs dry in", align: "right", cell: (r) => (r.hours === null ? "—" : <TimeText hours={r.hours} />), sortValue: (r) => r.hours ?? 999 },
];

function RetryDemo() {
  const [retrying, setRetrying] = useState(false);
  return (
    <ErrorState
      retrying={retrying}
      onRetry={() => {
        setRetrying(true);
        window.setTimeout(() => setRetrying(false), 1500);
      }}
    />
  );
}

function DialogDemo() {
  const [open, setOpen] = useState<"plain" | "note" | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <LiquidButton variant="secondary" onClick={() => setOpen("plain")}>Open confirm</LiquidButton>
      <LiquidButton variant="danger" onClick={() => setOpen("note")}>Reject with note</LiquidButton>
      <ConfirmDialog
        open={open === "plain"}
        onOpenChange={(o) => setOpen(o ? "plain" : null)}
        title="Mark all as read?"
        description="Notifications stay in the list; only the unread badge clears."
        confirmLabel="Mark read"
        onConfirm={() => setOpen(null)}
      />
      <ConfirmDialog
        open={open === "note"}
        onOpenChange={(o) => setOpen(o ? "note" : null)}
        title="Reject this swap?"
        description="Rahim Telecom will not receive ৳40,000 from Nadia Store. Your note goes to the audit log."
        confirmLabel="Reject swap"
        tone="danger"
        noteMinLength={5}
        onConfirm={(note) => {
          setOpen(null);
          toast({ tone: "info", title: "Swap rejected", body: note });
        }}
      />
    </div>
  );
}

function TableDemo() {
  const [mode, setMode] = useState<"data" | "loading" | "empty" | "error">("data");
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Table state"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: "data", label: "Data" },
          { value: "loading", label: "Loading" },
          { value: "empty", label: "Empty" },
          { value: "error", label: "Error" },
        ]}
      />
      <DataTable
        caption="Agents by risk"
        columns={COLUMNS}
        rows={mode === "data" ? KIT_ROWS : mode === "empty" ? [] : undefined}
        loading={mode === "loading"}
        error={mode === "error"}
        onRetry={() => setMode("data")}
        getRowId={(r) => r.id}
        empty={{ title: "No agents match", body: "Clear the filters to see every agent.", action: { label: "Clear filters", onClick: () => setMode("data") } }}
      />
    </div>
  );
}

function SegmentDemo() {
  const [float, setFloat] = useState<"cash" | "emoney">("cash");
  const [h, setH] = useState<"6" | "24" | "72">("24");
  return (
    <div className="flex flex-wrap gap-4">
      <SegmentedControl label="Float" value={float} onChange={setFloat} options={[{ value: "cash", label: "Cash" }, { value: "emoney", label: "e-money" }]} />
      <SegmentedControl label="Horizon" size="sm" value={h} onChange={setH} options={[{ value: "6", label: "6h" }, { value: "24", label: "24h" }, { value: "72", label: "72h" }]} />
    </div>
  );
}

export function FeedbackSections() {
  return (
    <>
      <KitSection id="toasts" title="Toasts" note="Spring-stacked, swipe to dismiss, aria-live polite">
        <div className="flex flex-wrap gap-2">
          <LiquidButton variant="secondary" onClick={() => toast({ tone: "success", title: "Swap approved", body: "Saved to the audit log." })}>Success</LiquidButton>
          <LiquidButton variant="secondary" onClick={() => toast({ tone: "info", title: "Forecast refreshed" })}>Info</LiquidButton>
          <LiquidButton variant="secondary" onClick={() => toast({ tone: "warning", title: "Data is 3 hours old", body: "Numbers may have moved since." })}>Warning</LiquidButton>
          <LiquidButton variant="secondary" onClick={() => toast({ tone: "error", title: "Could not save", body: "Check your connection and try again.", duration: 0 })}>Error (sticky)</LiquidButton>
        </div>
      </KitSection>

      <KitSection id="skeletons" title="Skeletons" note="Brand-tinted shimmer shaped like the final content">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KitState label="Text"><SkeletonText lines={4} /></KitState>
          <KitState label="Card"><SkeletonCard /></KitState>
          <KitState label="Gauge"><SkeletonGauge /></KitState>
          <KitState label="Runway"><SkeletonRunway /></KitState>
          <KitState label="Rows" className="md:col-span-2 xl:col-span-4"><SkeletonRows rows={3} cols={5} /></KitState>
        </div>
      </KitSection>

      <KitSection id="states" title="Empty and error states" note="Custom animated SVG, always with a next step">
        <div className="grid gap-4 md:grid-cols-3">
          <KitState label="Empty runway"><EmptyState title="No swaps waiting" body="New offers appear here when a nearby agent can help." action={{ label: "Open forecast", onClick: () => undefined, icon: ChartColumn }} /></KitState>
          <KitState label="Quiet pulse"><EmptyState illustration="quiet-pulse" title="All calm" body="No agent needs attention right now." action={{ label: "See all agents", onClick: () => undefined, icon: CircleCheck }} /></KitState>
          <KitState label="Error with retry"><RetryDemo /></KitState>
        </div>
      </KitSection>

      <KitSection id="tabs" title="Tabs" note="Sliding underline">
        <Tabs
          label="Agent detail"
          items={[
            { value: "overview", label: "Overview", icon: House, content: <SkeletonText lines={2} /> },
            { value: "swaps", label: "Swaps", icon: ArrowLeftRight, content: <p className="text-small text-muted">Two pending swaps.</p> },
            { value: "activity", label: "Activity", icon: RefreshCw, content: <p className="text-small text-muted">Last refill 3 hours ago.</p> },
            { value: "inbox", label: "Notes", icon: Inbox, content: <p className="text-small text-muted">No notes yet.</p> },
          ]}
        />
      </KitSection>

      <KitSection id="segmented" title="SegmentedControl" note="Sliding pill">
        <SegmentDemo />
      </KitSection>

      <KitSection id="table" title="DataTable" note="Sticky header, row hover glow, sort; loading, empty and error states" wide>
        <TableDemo />
      </KitSection>

      <KitSection id="dialog" title="ConfirmDialog" note="Optional required note for audited decisions">
        <DialogDemo />
      </KitSection>
    </>
  );
}
