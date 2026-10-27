import type { Cell, Column } from "@/types/api";

// Columns whose values are amounts in INR. The backend's metrics are all in rupees.
const MONEY_COLUMN = /(revenue|sales|spend|amount|price|value|aov|total_inr)/i;

export const isMoneyColumn = (key: string) => MONEY_COLUMN.test(key);

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrPrecise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number, key: string): string {
  if (isMoneyColumn(key)) return Math.abs(value) < 1000 ? inrPrecise.format(value) : inr.format(value);
  return number.format(value);
}

// Short axis labels: ₹12.5L, 3.4K.
export function formatCompact(value: number, key: string): string {
  return `${isMoneyColumn(key) ? "₹" : ""}${compact.format(value)}`;
}

export function formatCell(value: Cell, column: Column): string {
  if (value === null) return "—";
  if (typeof value === "number") return formatNumber(value, column.key);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatRelativeTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
