import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area, PieChart, Pie, Cell, ReferenceLine,
} from "recharts";
import { formatMoney } from "../utils/format";
import { EmptyState } from "./UI";

export const COLORS = { income: "#1F7A5C", expense: "#C2462F", savings: "#2F6FAE", grid: "#E3EAE6", axis: "#6B7A74" };

const axisProps = { tick: { fill: COLORS.axis, fontSize: 12 }, axisLine: false, tickLine: false };

function MoneyTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label && <strong>{label}</strong>}
      {payload.map((p) => (
        <span key={p.dataKey || p.name}>
          <i style={{ background: p.color || p.payload?.colour || p.payload?.fill }} />
          {p.name}: {formatMoney(p.value, currency)}
        </span>
      ))}
    </div>
  );
}

const hasData = (data, keys) => data?.some((d) => keys.some((k) => Number(d[k]) > 0));

export function IncomeExpenseChart({ data, currency, height = 280 }) {
  if (!hasData(data, ["income", "expense"])) {
    return <EmptyState icon="report" title="No income or expenses yet" text="Add a transaction to see the comparison." />;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={56} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
        <Tooltip content={<MoneyTooltip currency={currency} />} cursor={{ fill: "rgba(21,48,42,0.05)" }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13 }} />
        <Bar dataKey="income" name="Income" fill={COLORS.income} radius={[5, 5, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Expenses" fill={COLORS.expense} radius={[5, 5, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingTrendChart({ data, currency, height = 260, cumulative = true }) {
  if (!hasData(data, ["amount"])) {
    return <EmptyState icon="report" title="No spending in this period" text="Expenses will appear here day by day." />;
  }
  const key = cumulative ? "cumulative" : "amount";
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS.expense} stopOpacity={0.28} />
            <stop offset="100%" stopColor={COLORS.expense} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={COLORS.grid} />
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={(v) => formatMoney(v, currency, { compact: true })} />
        <Tooltip content={<MoneyTooltip currency={currency} />} />
        <Area type="monotone" dataKey={key} name={cumulative ? "Spent so far" : "Spent that day"}
          stroke={COLORS.expense} strokeWidth={2.2} fill="url(#spendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryDonut({ data, currency, height = 260 }) {
  if (!data?.length) {
    return <EmptyState icon="budget" title="No expenses by category" text="Categorised spending shows up here." />;
  }
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, c) => s + c.amount, 0);
  const slices = rest > 0 ? [...top, { category: "Others", amount: rest, colour: "#B7C2BD" }] : top;
  const total = data.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="donut-wrap">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={slices} dataKey="amount" nameKey="category" innerRadius="62%" outerRadius="92%"
              paddingAngle={1.5} stroke="none">
              {slices.map((s) => <Cell key={s.category} fill={s.colour} />)}
            </Pie>
            <Tooltip content={<MoneyTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <small>Total spent</small>
          <strong>{formatMoney(total, currency, { compact: total >= 1e6 })}</strong>
        </div>
      </div>
      <ul className="legend-list">
        {slices.map((s) => (
          <li key={s.category}>
            <i style={{ background: s.colour }} />
            <span>{s.category}</span>
            <b>{total ? Math.round((s.amount / total) * 100) : 0}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BudgetUsageChart({ data, currency, height }) {
  if (!data?.length) {
    return <EmptyState icon="budget" title="No budgets this month" text="Set a monthly limit to track usage." />;
  }
  const rows = data.map((b) => ({ ...b, shown: Math.min(b.usage_percentage, 150) }));
  const colourFor = (s) => (s === "Exceeded" ? "#C2462F" : s === "Near Limit" ? "#D39A12" : "#1F7A5C");
  return (
    <ResponsiveContainer width="100%" height={height || Math.max(160, rows.length * 38 + 40)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={COLORS.grid} />
        <XAxis type="number" domain={[0, (max) => Math.max(110, Math.ceil(max / 10) * 10)]} {...axisProps}
          tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="category" {...axisProps} width={96} />
        <ReferenceLine x={100} stroke="#15302A" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ fill: "rgba(21,48,42,0.05)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const b = payload[0].payload;
            return (
              <div className="chart-tip">
                <strong>{b.category}</strong>
                <span>{formatMoney(b.spent, currency)} of {formatMoney(b.limit_amount, currency)}</span>
                <span>{b.usage_percentage}% used · {b.status}</span>
              </div>
            );
          }}
        />
        <Bar dataKey="shown" name="Used" radius={[0, 5, 5, 0]} maxBarSize={18}>
          {rows.map((b) => <Cell key={b.id} fill={colourFor(b.status)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
