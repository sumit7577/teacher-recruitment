import Column from "@/components/common/Column";
import Row from "@/components/common/Row";

export default function ProgressBar({
  value, label, tone = "accent",
}: {
  value: number;
  label?: string;
  tone?: "accent" | "ok";
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <Column className="gap-1.5">
      {label ? (
        <Row className="items-baseline justify-between">
          <span className="text-xs font-semibold text-ink-2">{label}</span>
          <span className="text-xs font-bold text-ink-1">{clamped}%</span>
        </Row>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={tone === "ok" ? "h-full rounded-full bg-ok" : "h-full rounded-full bg-accent"}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </Column>
  );
}
