import type { LucideIcon } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

export type Range = 'today' | '30d' | '12m';

const RANGES: [Range, string][] = [
  ['today', '24 giờ'],
  ['30d', '30 ngày'],
  ['12m', '12 tháng'],
];

export const SELECTED = 'border-primary text-primary hover:text-primary';

// period is HH24, YYYY-MM-DD or YYYY-MM depending on the range.
export const periodLabel = (range: Range, period: string, long = false) => {
  if (range === 'today') return `${period}:00`;
  const [y, m, d] = period.split('-');
  if (range === '30d') return long ? `${d}/${m}/${y}` : `${d}/${m}`;
  return long ? `Tháng ${Number(m)}/${y}` : `${m}/${y.slice(2)}`;
};

const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact' });

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

export function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {RANGES.map(([range, label]) => (
        <Button
          key={range}
          size="sm"
          variant="outline"
          className={value === range ? SELECTED : undefined}
          onClick={() => onChange(range)}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

export function IconStat({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-medium tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">
            {label}
            {note && ` · ${note}`}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export const cancelRate = (cancelled: number, completed: number) =>
  cancelled + completed
    ? `${Math.round((cancelled * 100) / (cancelled + completed))}%`
    : null;

export function SeriesChart<K extends string>({
  title,
  data,
  dataKey,
  range,
  format,
  className,
}: {
  title: string;
  data: ({ period: string } & Record<K, number>)[];
  dataKey: K;
  range: Range;
  format: (value: number) => string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{ [dataKey]: { label: title, color: 'var(--chart-1)' } }}
          className="aspect-auto h-56 w-full"
        >
          <BarChart data={data} margin={{ left: 4, right: 4 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tickFormatter={(p: string) => periodLabel(range, p)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              tickFormatter={(v: number) => compact.format(v)}
            />
            <ChartTooltip
              cursor={{ fillOpacity: 0.4 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) =>
                    periodLabel(range, payload?.[0]?.payload.period, true)
                  }
                  formatter={(value) => (
                    <span className="flex w-full justify-between gap-4">
                      <span className="text-muted-foreground">{title}</span>
                      <span className="font-medium tabular-nums">
                        {format(Number(value))}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <Bar
              dataKey={dataKey}
              fill={`var(--color-${dataKey})`}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
