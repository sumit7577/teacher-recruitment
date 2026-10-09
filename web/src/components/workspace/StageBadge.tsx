import { cn } from "@/lib/cn";
import type { Stage } from "@/networking/types";

/**
 * The pipeline stage, coloured by what it means rather than by where it sits.
 *
 * `rejected` is red and `joined` is green, but everything between them is the same
 * neutral accent — a gradient from grey to green would imply that `interview` is
 * nearly a placement, and it is not. The teacher's progress bar carries the sense
 * of distance; this carries the fact.
 */
const TONE: Partial<Record<Stage, string>> = {
  joined: "chip-ok",
  offered: "chip-ok",
  rejected: "chip-bad",
  withdrawn: "chip-bad",
  demo_scheduled: "chip-warn",
  shortlisted: "chip-accent",
};

export default function StageBadge({ stage, label }: { stage: Stage; label: string }) {
  return <span className={cn("chip", TONE[stage])}>{label}</span>;
}
