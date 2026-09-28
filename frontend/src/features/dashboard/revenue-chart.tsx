'use client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, moneyCompact } from '@/lib/utils';

type Point = { month: string; invoiced: string; collected: string };

export function RevenueChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => ({
    label: new Date(d.month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    invoiced: Number(d.invoiced),
    collected: Number(d.collected),
  }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <defs>
          {[['inv', '#6366f1'], ['col', '#10b981']].map(([id, c]) => (
            <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--fg-muted)" />
        <YAxis tickFormatter={moneyCompact} tickLine={false} axisLine={false} fontSize={12} width={60} stroke="var(--fg-muted)" />
        <Tooltip formatter={(v) => money(Number(v))} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }} />
        <Area type="monotone" dataKey="invoiced" name="Invoiced" stroke="#6366f1" fill="url(#inv)" strokeWidth={2} />
        <Area type="monotone" dataKey="collected" name="Collected" stroke="#10b981" fill="url(#col)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
