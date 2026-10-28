import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';

export type PeriodKind = 'day' | 'month' | 'year';
// One calendar day, month or year; `at` is YYYY-MM-DD, YYYY-MM or YYYY.
export interface Period {
  period: PeriodKind;
  at: string;
}

const KINDS: Record<PeriodKind, string> = {
  day: 'Ngày',
  month: 'Tháng',
  year: 'Năm',
};
const AT_LENGTH: Record<PeriodKind, number> = { day: 10, month: 7, year: 4 };

const todayInVietnam = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

export const currentPeriod = (period: PeriodKind = 'month'): Period => ({
  period,
  at: todayInVietnam().slice(0, AT_LENGTH[period]),
});

export const periodQuery = ({ period, at }: Period) =>
  `period=${period}&at=${at}`;

// The period `step` days, months or years away.
function shift({ period, at }: Period, step: number): Period {
  const [y, m = 1, d = 1] = at.split('-').map(Number);
  const date = new Date(
    Date.UTC(
      y + (period === 'year' ? step : 0),
      m - 1 + (period === 'month' ? step : 0),
      d + (period === 'day' ? step : 0),
    ),
  );
  return {
    period,
    at: date.toISOString().slice(0, AT_LENGTH[period]),
  };
}

export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period;
  onChange: (period: Period) => void;
}) {
  const latest = currentPeriod(value.period).at;
  const input =
    value.period === 'day' ? 'date' : value.period === 'month' ? 'month' : null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="flex gap-1 rounded-lg border p-1">
        {(Object.keys(KINDS) as PeriodKind[]).map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={value.period === kind ? 'default' : 'ghost'}
            onClick={() => onChange(currentPeriod(kind))}
          >
            {KINDS[kind]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          aria-label="Kỳ trước"
          onClick={() => onChange(shift(value, -1))}
        >
          <ChevronLeft />
        </Button>
        {input ? (
          <Input
            type={input}
            aria-label="Chọn kỳ"
            className="w-44"
            value={value.at}
            max={latest}
            onChange={(e) =>
              e.target.value &&
              onChange({ period: value.period, at: e.target.value })
            }
          />
        ) : (
          <Input
            type="number"
            aria-label="Chọn năm"
            className="w-28"
            value={value.at}
            min={2000}
            max={latest}
            onChange={(e) =>
              /^\d{4}$/.test(e.target.value) &&
              e.target.value <= latest &&
              onChange({ period: 'year', at: e.target.value })
            }
          />
        )}
        <Button
          size="icon"
          variant="outline"
          aria-label="Kỳ sau"
          disabled={value.at >= latest}
          onClick={() => onChange(shift(value, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {value.at !== latest && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange(currentPeriod(value.period))}
        >
          {value.period === 'day'
            ? 'Hôm nay'
            : value.period === 'month'
              ? 'Tháng này'
              : 'Năm nay'}
        </Button>
      )}
    </div>
  );
}

export const SELECTED = 'border-primary text-primary hover:text-primary';

// A bucket is HH24, YYYY-MM-DD or YYYY-MM for a day, month or year.
export const periodLabel = (kind: PeriodKind, bucket: string, long = false) => {
  if (kind === 'day') return `${bucket}:00`;
  const [y, m, d] = bucket.split('-');
  if (kind === 'month') return long ? `${d}/${m}/${y}` : `${d}/${m}`;
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
  kind,
  format,
  className,
}: {
  title: string;
  data: ({ period: string } & Record<K, number>)[];
  dataKey: K;
  kind: PeriodKind;
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
              tickFormatter={(p: string) => periodLabel(kind, p)}
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
                    periodLabel(kind, payload?.[0]?.payload.period, true)
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
            >
              {data.map((d) => (
                <Cell
                  key={d.period}
                  fill={
                    d[dataKey] < 0
                      ? 'var(--destructive)'
                      : `var(--color-${dataKey})`
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part * 1000) / whole) / 10}%` : '0%';

// Parts of one whole in a donut, each with its value and share listed beside it.
export function ShareChart({
  title,
  parts,
  format,
  extra,
}: {
  title: string;
  parts: { label: string; value: number }[];
  format: (value: number) => string;
  extra?: [string, string];
}) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const data = parts.map((p, i) => ({
    ...p,
    key: `part${i}`,
    fill: `var(--chart-${i + 1})`,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid items-center gap-4 sm:grid-cols-[10rem_1fr]">
        {total ? (
          <ChartContainer
            config={Object.fromEntries(
              data.map((d) => [d.key, { label: d.label, color: d.fill }]),
            )}
            className="mx-auto aspect-square w-40"
          >
            <PieChart>
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    formatter={(value, name) => (
                      <span className="flex w-full justify-between gap-4">
                        <span className="text-muted-foreground">{name}</span>
                        <span className="font-medium tabular-nums">
                          {format(Number(value))} ·{' '}
                          {percent(Number(value), total)}
                        </span>
                      </span>
                    )}
                  />
                }
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="55%"
                stroke="var(--card)"
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.key} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="mx-auto grid aspect-square w-40 place-items-center rounded-full border-[1.25rem] border-muted text-xs text-muted-foreground">
            0
          </div>
        )}
        <ul className="grid gap-2 text-sm">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: d.fill }}
              />
              <span className="text-muted-foreground">{d.label}</span>
              <span className="ml-auto tabular-nums">{format(d.value)}</span>
              <span className="w-12 text-right font-medium tabular-nums">
                {percent(d.value, total)}
              </span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t pt-2 font-medium">
            <span>Tổng</span>
            <span className="ml-auto tabular-nums">{format(total)}</span>
            <span className="w-12" />
          </li>
          {extra && (
            <li className="flex items-center gap-2">
              <span className="text-muted-foreground">{extra[0]}</span>
              <span className="ml-auto tabular-nums">{extra[1]}</span>
              <span className="w-12" />
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
