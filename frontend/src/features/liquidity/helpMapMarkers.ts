// Open help requests drawn over the risk map: a pulsing dot with a visible text label. The pulse is a
// CSS animation under motion-safe, so reduced-motion users get a steady dot. Each marker is labelled
// for screen readers and carries its text, so colour is never the only signal.
import { Marker, type Map as MlMap } from "maplibre-gl";

import { cn } from "../../lib/cn";
import type { HelpMapPoint } from "./helpModel";

const WRAP = "pointer-events-none flex items-center gap-1.5 rounded-full border border-act-solid bg-surface px-2 py-0.5 shadow-soft";
const TEXT = "num text-[11px] font-semibold text-fg";

export interface HelpMarkerText {
  /** Visible label, e.g. "Help ৳15,000". */
  text: string;
  /** Read by screen readers, e.g. "Open help request from Mirpur 10: ৳15,000 cash". */
  label: string;
}

function build(text: HelpMarkerText): HTMLElement {
  const el = document.createElement("div");
  el.className = cn(WRAP);
  el.dataset["testid"] = "help-marker";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", text.label);
  el.innerHTML =
    '<span aria-hidden="true" class="relative flex size-2.5">' +
    '<span class="absolute inline-flex size-full rounded-full bg-act-solid opacity-75 motion-safe:animate-ping"></span>' +
    '<span class="relative inline-flex size-2.5 rounded-full bg-act-solid"></span></span>';
  const span = document.createElement("span");
  span.className = TEXT;
  span.dataset["part"] = "text";
  span.textContent = text.text;
  el.appendChild(span);
  return el;
}

/** Keep one marker per open request; move, relabel or remove them as the list changes. */
export function syncHelpMarkers(
  map: MlMap,
  markers: Map<number, Marker>,
  points: readonly HelpMapPoint[],
  format: (p: HelpMapPoint) => HelpMarkerText,
): void {
  const keep = new Set<number>();
  for (const p of points) {
    keep.add(p.id);
    const copy = format(p);
    const existing = markers.get(p.id);
    if (existing) {
      existing.setLngLat([p.lng, p.lat]);
      existing.getElement().setAttribute("aria-label", copy.label);
      const span = existing.getElement().querySelector<HTMLElement>("[data-part=text]");
      if (span) span.textContent = copy.text;
    } else {
      markers.set(p.id, new Marker({ element: build(copy), anchor: "bottom", offset: [0, -6] }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }
  for (const [id, marker] of markers) {
    if (!keep.has(id)) {
      marker.remove();
      markers.delete(id);
    }
  }
}
