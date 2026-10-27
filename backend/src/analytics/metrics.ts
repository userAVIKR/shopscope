// The single source of truth for business metrics. The AI is told to use these exact
// definitions, and the evaluation tests compare its answers against them.
// Keep in sync with the business rules at the top of database/schema.sql.

// Orders with these statuses never count towards any metric.
export const EXCLUDED_ORDER_STATUSES = ["cancelled"] as const;

const COUNTED_ORDERS = "orders.status <> 'cancelled'";

export type Metric = {
  id: string;
  name: string;
  description: string;
  // SQL expression using fully qualified table.column names (no aliases).
  expression: string;
  // WHERE condition that must always be applied with the expression.
  filter: string;
  // Tables the expression needs. Joined using the approved relationships.
  tables: readonly string[];
  unit: "INR" | "count" | "units";
};

export const METRICS: readonly Metric[] = [
  {
    id: "revenue",
    name: "Revenue",
    description: "Gross item sales in INR: quantity times the price paid, excluding cancelled orders. Not net of tax, discounts, shipping or refunds.",
    expression: "SUM(order_items.quantity * order_items.unit_price)",
    filter: COUNTED_ORDERS,
    tables: ["orders", "order_items"],
    unit: "INR",
  },
  {
    id: "order_count",
    name: "Order count",
    description: "Number of orders, excluding cancelled orders.",
    expression: "COUNT(DISTINCT orders.id)",
    filter: COUNTED_ORDERS,
    tables: ["orders"],
    unit: "count",
  },
  {
    id: "average_order_value",
    name: "Average order value",
    description: "Revenue divided by order count, excluding cancelled orders.",
    expression: "SUM(order_items.quantity * order_items.unit_price) / NULLIF(COUNT(DISTINCT orders.id), 0)",
    filter: COUNTED_ORDERS,
    tables: ["orders", "order_items"],
    unit: "INR",
  },
  {
    id: "units_sold",
    name: "Units sold",
    description: "Total quantity of items sold, excluding cancelled orders.",
    expression: "SUM(order_items.quantity)",
    filter: COUNTED_ORDERS,
    tables: ["orders", "order_items"],
    unit: "units",
  },
];

export function getMetric(id: string): Metric | undefined {
  return METRICS.find((metric) => metric.id === id);
}

// Rules the model must follow beyond the metric formulas themselves.
export const BUSINESS_RULES: readonly string[] = [
  "Cancelled orders (orders.status = 'cancelled') never count towards revenue, order count, average order value or units sold.",
  "For sales amounts use order_items.unit_price (price actually paid), not products.unit_price (current list price).",
  "Amounts are in Indian Rupees (INR).",
  "Date questions use orders.order_date. \"Last month\" means the previous full calendar month before today's date.",
];
