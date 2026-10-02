/** Greedy lanes so overlapping events stack instead of covering each other. Input sorted by start. */
export function assignLanes(events: ReadonlyArray<{ startHour: number; endHour: number }>): number[] {
  const ends: number[] = [];
  return events.map((ev) => {
    const lane = ends.findIndex((end) => end <= ev.startHour);
    const at = lane === -1 ? ends.length : lane;
    ends[at] = ev.endHour;
    return at;
  });
}
