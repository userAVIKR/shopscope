// Recreates the analytics tables and fills them with deterministic demo data.
// Same seed => same rows every run, so answers to known questions can be verified.
//
// Run: npm run db:seed   (uses ANALYTICS_ADMIN_DATABASE_URL from backend/.env)

import { readFile } from "node:fs/promises";
import pg from "pg";

const SEED = 20241001;
const CUSTOMER_COUNT = 500;
const ORDER_COUNT = 5000;
// Orders cover 24 full months. Fixed dates keep the data identical on every run.
const FIRST_ORDER_DATE = "2024-10-01";
const LAST_ORDER_DATE = "2026-09-30";
// Products marked inactive stop appearing in orders from this date.
const DISCONTINUED_FROM = "2026-01-01";

// ---------- deterministic random helpers ----------

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED);

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

// ---------- date helpers (UTC, whole days) ----------

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS;
const toIso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

// ---------- reference data ----------

const CATEGORIES: { name: string; priceRange: [number, number]; popularity: number; maxQuantity: number; products: string[] }[] = [
  { name: "Electronics", priceRange: [799, 24999], popularity: 14, maxQuantity: 2, products: ["Wireless Earbuds", "Bluetooth Speaker", "Smartwatch", "Power Bank 20000mAh", "USB-C Charger 65W", "Smartphone 5G", "Noise Cancelling Headphones", "Fitness Band", "Portable SSD 1TB", "Wi-Fi Router"] },
  { name: "Fashion", priceRange: [299, 4999], popularity: 16, maxQuantity: 3, products: ["Cotton Kurta", "Denim Jeans", "Silk Saree", "Linen Shirt", "Running Shoes", "Leather Wallet", "Sports T-Shirt", "Winter Jacket", "Ethnic Dupatta", "Canvas Sneakers"] },
  { name: "Home & Kitchen", priceRange: [199, 6999], popularity: 13, maxQuantity: 2, products: ["Pressure Cooker 5L", "Non-stick Tawa", "Mixer Grinder", "Steel Water Bottle", "Cotton Bedsheet Set", "Air Fryer", "Dinner Set 24 pcs", "LED Table Lamp", "Storage Containers Set", "Electric Kettle"] },
  { name: "Beauty & Personal Care", priceRange: [99, 1999], popularity: 12, maxQuantity: 3, products: ["Herbal Face Wash", "Sunscreen SPF 50", "Hair Oil 200ml", "Beard Trimmer", "Hair Dryer", "Moisturiser 100ml", "Matte Lipstick", "Perfume 100ml", "Shampoo 340ml", "Kajal Pencil"] },
  { name: "Grocery", priceRange: [99, 1499], popularity: 15, maxQuantity: 5, products: ["Basmati Rice 5kg", "Toor Dal 1kg", "Assam Tea 500g", "Filter Coffee 500g", "Mustard Oil 1L", "Ghee 1L", "Atta 10kg", "Dry Fruits Mix 500g", "Spice Masala Box", "Honey 500g"] },
  { name: "Books", priceRange: [149, 899], popularity: 7, maxQuantity: 2, products: ["Indian History Paperback", "Python Programming Guide", "Bestselling Novel", "Children's Story Book", "Exam Prep Guide", "Indian Recipes Cookbook", "Self-help Classic", "Comic Collection", "Poetry Anthology", "Business Strategy Book"] },
  { name: "Sports & Fitness", priceRange: [149, 4999], popularity: 7, maxQuantity: 2, products: ["Yoga Mat", "Cricket Bat", "Badminton Racket", "Dumbbell Set 10kg", "Football", "Skipping Rope", "Cycling Helmet", "Resistance Bands", "Gym Gloves", "Table Tennis Set"] },
  { name: "Toys & Games", priceRange: [199, 3999], popularity: 6, maxQuantity: 2, products: ["Building Blocks Set", "Remote Control Car", "Ludo Board Game", "Jigsaw Puzzle 1000pcs", "Soft Teddy Bear", "Chess Set", "Art & Craft Kit", "Toy Kitchen Set", "Science Experiment Kit", "Doll House"] },
  { name: "Furniture", priceRange: [999, 14999], popularity: 4, maxQuantity: 1, products: ["Study Table", "Office Chair", "Bookshelf 5-tier", "Shoe Rack", "Bean Bag XXL", "Coffee Table", "Wardrobe 2-door", "Bedside Table", "Plastic Chairs Set of 4", "Folding Bed"] },
  { name: "Stationery", priceRange: [49, 1499], popularity: 6, maxQuantity: 5, products: ["Ballpoint Pens Pack of 10", "A4 Notebook Pack", "Geometry Box", "Highlighters Set", "Sticky Notes", "Desk Organiser", "Fountain Pen", "Watercolour Paint Set", "School Backpack", "Scientific Calculator"] },
];

const CITIES = ["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow", "Kochi", "Chandigarh", "Indore", "Bhopal", "Patna", "Surat", "Nagpur", "Coimbatore", "Guwahati", "Bhubaneswar"];
const CITY_WEIGHTS = [14, 14, 13, 9, 8, 7, 7, 5, 4, 3, 3, 2, 2, 2, 1, 2, 1, 1, 1, 1];

const FIRST_NAMES = ["Aarav", "Vivaan", "Aditya", "Arjun", "Rohan", "Karan", "Rahul", "Siddharth", "Vikram", "Amit", "Rajesh", "Suresh", "Nikhil", "Pranav", "Ishaan", "Ananya", "Diya", "Priya", "Sneha", "Kavya", "Meera", "Pooja", "Neha", "Riya", "Aditi", "Shreya", "Lakshmi", "Divya", "Isha", "Fatima", "Imran", "Zoya", "Harpreet", "Gurpreet", "Joseph", "Mary", "Arnav", "Tanvi", "Yash", "Sanjana"];
const LAST_NAMES = ["Sharma", "Verma", "Gupta", "Patel", "Shah", "Reddy", "Rao", "Iyer", "Nair", "Menon", "Das", "Banerjee", "Chatterjee", "Mukherjee", "Singh", "Kaur", "Gill", "Khan", "Ahmed", "Fernandes", "D'Souza", "Joshi", "Kulkarni", "Deshmukh", "Pillai", "Yadav", "Mishra", "Pandey", "Jain", "Agarwal"];

// Festive season (Oct-Nov) is busiest; January and post-monsoon dip slightly.
const MONTH_SEASONALITY = [0.9, 0.95, 1.0, 1.0, 1.05, 0.95, 0.9, 1.0, 1.1, 1.45, 1.6, 1.2];

// ---------- generators ----------

function generateCategoriesAndProducts() {
  const categories = CATEGORIES.map((c, i) => ({ id: i + 1, name: c.name }));
  const products: { id: number; name: string; categoryId: number; unitPrice: number; active: boolean }[] = [];

  CATEGORIES.forEach((category, ci) => {
    const [min, max] = category.priceRange;
    for (const name of category.products) {
      // Log-uniform spread, rounded to a typical "...9" retail price.
      const raw = min * Math.pow(max / min, random());
      const unitPrice = Math.max(min, Math.round(raw / 10) * 10 - 1);
      products.push({ id: products.length + 1, name, categoryId: ci + 1, unitPrice, active: random() >= 0.08 });
    }
  });

  return { categories, products };
}

function generateCustomers() {
  const firstOrderDay = toDay(FIRST_ORDER_DATE);
  const lastOrderDay = toDay(LAST_ORDER_DATE);
  const earlyStart = toDay("2024-01-01");

  const signups = Array.from({ length: CUSTOMER_COUNT }, (_, i) => {
    // 30% signed up before orders begin, so early orders have customers.
    const day = i < CUSTOMER_COUNT * 0.3 ? randomInt(earlyStart, firstOrderDay - 1) : randomInt(firstOrderDay, lastOrderDay);
    const seconds = randomInt(0, DAY_MS / 1000 - 1);
    return { day, createdAt: new Date(day * DAY_MS + seconds * 1000).toISOString() };
  });
  signups.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Ids follow signup order, which makes "customers who existed on day X" a prefix.
  return signups.map((s, i) => ({
    id: i + 1,
    name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    city: weightedPick(CITIES, CITY_WEIGHTS),
    createdAt: s.createdAt,
    signupDay: s.day,
  }));
}

function statusFor(daysBeforeEnd: number): string {
  if (daysBeforeEnd <= 3) return weightedPick(["pending", "paid", "shipped", "cancelled"], [30, 40, 25, 5]);
  if (daysBeforeEnd <= 10) return weightedPick(["paid", "shipped", "delivered", "cancelled"], [10, 50, 32, 8]);
  return weightedPick(["delivered", "cancelled"], [92, 8]);
}

function generateOrders(
  customers: ReturnType<typeof generateCustomers>,
  products: ReturnType<typeof generateCategoriesAndProducts>["products"],
) {
  const firstDay = toDay(FIRST_ORDER_DATE);
  const lastDay = toDay(LAST_ORDER_DATE);
  const discontinuedDay = toDay(DISCONTINUED_FROM);

  // Weight every day by business growth, season and weekend.
  const days: number[] = [];
  const dayWeights: number[] = [];
  for (let day = firstDay; day <= lastDay; day++) {
    const date = new Date(day * DAY_MS);
    const growth = 1 + 0.6 * ((day - firstDay) / (lastDay - firstDay));
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 1.2 : 1;
    days.push(day);
    dayWeights.push(growth * MONTH_SEASONALITY[date.getUTCMonth()]! * weekend);
  }

  const orderDays = Array.from({ length: ORDER_COUNT }, () => weightedPick(days, dayWeights)).sort((a, b) => a - b);
  const categoryWeights = CATEGORIES.map((c) => c.popularity);

  const orders: { id: number; customerId: number; status: string; orderDate: string }[] = [];
  const items: { id: number; orderId: number; productId: number; quantity: number; unitPrice: number }[] = [];

  let eligibleCustomers = 0;
  for (const day of orderDays) {
    while (eligibleCustomers < customers.length && customers[eligibleCustomers]!.signupDay <= day) eligibleCustomers++;

    const orderId = orders.length + 1;
    orders.push({
      id: orderId,
      customerId: customers[randomInt(0, eligibleCustomers - 1)]!.id,
      status: statusFor(lastDay - day),
      orderDate: toIso(day),
    });

    const available = products.filter((p) => p.active || day < discontinuedDay);
    const lineCount = weightedPick([1, 2, 3, 4], [50, 30, 15, 5]);
    const chosen = new Set<number>();
    while (chosen.size < lineCount) {
      const categoryIndex = CATEGORIES.indexOf(weightedPick(CATEGORIES, categoryWeights));
      const candidates = available.filter((p) => p.categoryId === categoryIndex + 1);
      if (candidates.length === 0) continue;
      const product = pick(candidates);
      if (chosen.has(product.id)) continue;
      chosen.add(product.id);

      const maxQuantity = CATEGORIES[categoryIndex]!.maxQuantity;
      const quantity = weightedPick([1, 2, 3, 4, 5].slice(0, maxQuantity), [60, 22, 10, 5, 3].slice(0, maxQuantity));
      items.push({ id: items.length + 1, orderId, productId: product.id, quantity, unitPrice: product.unitPrice });
    }
  }

  return { orders, items };
}

// ---------- database ----------

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  const connectionString = process.env.ANALYTICS_ADMIN_DATABASE_URL;
  if (!connectionString) throw new Error("ANALYTICS_ADMIN_DATABASE_URL is not set. Copy backend/.env.example to backend/.env.");

  const { categories, products } = generateCategoriesAndProducts();
  const customers = generateCustomers();
  const { orders, items } = generateOrders(customers, products);

  const schemaSql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query(schemaSql);

    await client.query(
      "INSERT INTO categories (id, name) SELECT * FROM unnest($1::int[], $2::text[])",
      [categories.map((c) => c.id), categories.map((c) => c.name)],
    );
    await client.query(
      `INSERT INTO products (id, name, category_id, unit_price, active)
       SELECT * FROM unnest($1::int[], $2::text[], $3::int[], $4::numeric[], $5::bool[])`,
      [products.map((p) => p.id), products.map((p) => p.name), products.map((p) => p.categoryId), products.map((p) => p.unitPrice), products.map((p) => p.active)],
    );
    await client.query(
      `INSERT INTO customers (id, name, city, created_at)
       SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::timestamptz[])`,
      [customers.map((c) => c.id), customers.map((c) => c.name), customers.map((c) => c.city), customers.map((c) => c.createdAt)],
    );
    await client.query(
      `INSERT INTO orders (id, customer_id, status, order_date)
       SELECT * FROM unnest($1::int[], $2::int[], $3::text[], $4::date[])`,
      [orders.map((o) => o.id), orders.map((o) => o.customerId), orders.map((o) => o.status), orders.map((o) => o.orderDate)],
    );
    await client.query(
      `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
       SELECT * FROM unnest($1::int[], $2::int[], $3::int[], $4::int[], $5::numeric[])`,
      [items.map((i) => i.id), items.map((i) => i.orderId), items.map((i) => i.productId), items.map((i) => i.quantity), items.map((i) => i.unitPrice)],
    );

    // Explicit ids were inserted, so move the identity sequences past them.
    for (const table of ["categories", "products", "customers", "orders", "order_items"]) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT max(id) FROM ${table}))`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  const { rows } = await client.query<{ revenue: string; orders: string; cancelled: string }>(`
    SELECT
      (SELECT sum(oi.quantity * oi.unit_price) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled') AS revenue,
      (SELECT count(*) FROM orders WHERE status <> 'cancelled') AS orders,
      (SELECT count(*) FROM orders WHERE status = 'cancelled') AS cancelled
  `);
  await client.end();

  const summary = rows[0]!;
  console.log("Seeded shopscope_analytics:");
  console.table({
    categories: categories.length,
    products: products.length,
    customers: customers.length,
    orders: orders.length,
    order_items: items.length,
  });
  console.log(`Revenue (excl. cancelled): ₹${Number(summary.revenue).toLocaleString("en-IN")}`);
  console.log(`Counted orders: ${summary.orders} · Cancelled: ${summary.cancelled}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
