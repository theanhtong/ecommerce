import { Button } from '@/components/ui/button';

// Kept apart from the charts in report.tsx, so pages that only filter do not load the chart library.
export const SELECTED = 'border-primary text-primary hover:text-primary';

export function Filter<S extends string>({
  labels,
  value,
  onChange,
}: {
  labels: Record<S, string>;
  value: S;
  onChange: (value: S) => void;
}) {
  return (
    <div className="mb-4 flex gap-2">
      {(Object.keys(labels) as S[]).map((s) => (
        <Button
          key={s}
          size="sm"
          variant="outline"
          className={value === s ? SELECTED : undefined}
          onClick={() => onChange(s)}
        >
          {labels[s]}
        </Button>
      ))}
    </div>
  );
}
