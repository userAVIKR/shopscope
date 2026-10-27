"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { formatCompact, formatNumber } from "@/lib/format";
import { findColumn, safeVisualization, sortByX } from "@/lib/visualization";
import type { Column, QueryResult, Row } from "@/types/api";
import styles from "./ResultsChart.module.css";

// SVG attributes cannot read CSS variables, so resolve the theme tokens to real colours (and follow dark mode).
function useChartColors() {
  const read = () => {
    if (typeof window === "undefined") return null;
    const css = getComputedStyle(document.documentElement);
    const get = (name: string) => css.getPropertyValue(name).trim();
    return { series: get("--series-1"), grid: get("--grid"), axis: get("--axis"), muted: get("--text-muted") };
  };
  const [colors, setColors] = useState(read);

  useEffect(() => {
    setColors(read());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setColors(read());
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return colors;
}

function ChartTooltip({ active, payload, label, xColumn }: TooltipContentProps<ValueType, NameType> & { xColumn?: Column }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipLabel}>
        {xColumn?.label}: {String(label)}
      </div>
      {payload.map((item) => (
        <div key={String(item.dataKey)} className={styles.tooltipRow}>
          <span>{item.name}</span>
          <strong>{typeof item.value === "number" ? formatNumber(item.value, String(item.dataKey)) : String(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

const axisTick = (fill: string) => ({ fill, fontSize: 12 });

type SeriesChartProps = { kind: "line" | "bar"; rows: Row[]; xColumn: Column; yColumn: Column; colors: NonNullable<ReturnType<typeof useChartColors>> };

function SeriesChart({ kind, rows, xColumn, yColumn, colors }: SeriesChartProps) {
  const yTick = (v: number) => formatCompact(v, yColumn.key);
  const tooltip = (props: TooltipContentProps<ValueType, NameType>) => <ChartTooltip {...props} xColumn={xColumn} />;

  if (kind === "bar") {
    // Horizontal bars keep category names readable.
    const height = Math.max(180, rows.length * 34 + 40);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={colors.grid} />
          <XAxis type="number" tickFormatter={yTick} tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} />
          <YAxis
            type="category"
            dataKey={xColumn.key}
            width={130}
            tick={axisTick(colors.muted)}
            axisLine={{ stroke: colors.axis }}
            tickLine={false}
          />
          <Tooltip content={tooltip} cursor={{ fill: colors.grid, opacity: 0.5 }} />
          <Bar dataKey={yColumn.key} name={yColumn.label} fill={colors.series} radius={[0, 4, 4, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid vertical={false} stroke={colors.grid} />
        <XAxis dataKey={xColumn.key} tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} minTickGap={16} />
        <YAxis tickFormatter={yTick} tick={axisTick(colors.muted)} axisLine={false} tickLine={false} width={64} />
        <Tooltip content={tooltip} cursor={{ stroke: colors.axis, strokeWidth: 1 }} />
        <Line
          type="monotone"
          dataKey={yColumn.key}
          name={yColumn.label}
          stroke={colors.series}
          strokeWidth={2}
          dot={rows.length <= 24 ? { r: 3, fill: colors.series, strokeWidth: 0 } : false}
          activeDot={{ r: 5, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ResultsChart({ result }: { result: QueryResult }) {
  const colors = useChartColors();
  const viz = safeVisualization(result);

  if (viz.type === "table" || !colors) {
    return <p className={styles.empty}>This result is best read as a table.</p>;
  }

  if (viz.type === "metric") {
    const column = findColumn(result.columns, viz.valueKey)!;
    const value = result.rows[0]?.[viz.valueKey];
    return (
      <div className={styles.metric}>
        <span className={styles.metricLabel}>{column.label}</span>
        <span className={styles.metricValue}>{typeof value === "number" ? formatNumber(value, column.key) : "—"}</span>
      </div>
    );
  }

  const xColumn = findColumn(result.columns, viz.xKey)!;
  const rows = viz.type === "line" ? sortByX(result.rows, viz.xKey) : result.rows;
  const yColumns = viz.yKeys.map((key) => findColumn(result.columns, key)!);

  // One chart per measure: never two y-scales on one chart.
  return (
    <div className={styles.charts}>
      {yColumns.map((yColumn) => (
        <figure key={yColumn.key} className={styles.figure}>
          <figcaption className={styles.caption}>
            {yColumn.label} by {xColumn.label.toLowerCase()}
          </figcaption>
          <SeriesChart kind={viz.type} rows={rows} xColumn={xColumn} yColumn={yColumn} colors={colors} />
        </figure>
      ))}
    </div>
  );
}
