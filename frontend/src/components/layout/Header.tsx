"use client";

import { ChartNoAxesCombined } from "lucide-react";
import { useEffect, useState } from "react";
import { getHealth } from "@/services/query-service";
import type { Health } from "@/types/api";
import styles from "./AppShell.module.css";

type Connection = { label: string; tone: "good" | "warning" | "critical" | "muted" };

// Status comes from /health, never assumed.
const aiName = (health: Health) => (health.ai.provider === "gemini" ? "Gemini" : "Local AI");

function describe(health: Health | null | undefined): Connection {
  if (health === undefined) return { label: "Checking connection…", tone: "muted" };
  if (health === null) return { label: "Backend unreachable", tone: "critical" };
  if (health.checks.analyticsDatabase !== "up") return { label: "Database offline", tone: "critical" };
  if (health.checks.aiModel !== "up") return { label: `Connected · ${aiName(health)} offline`, tone: "warning" };
  return { label: `Connected · ${aiName(health)}`, tone: "good" };
}

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  const [health, setHealth] = useState<Health | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const check = () => getHealth().then((h) => active && setHealth(h));
    void check();
    const timer = setInterval(check, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const connection = describe(health);

  return (
    <header className={styles.header}>
      <div className={styles.headerTitle}>
        <ChartNoAxesCombined size={22} strokeWidth={1.75} aria-hidden="true" />
        <div>
          <h1>{title}</h1>
          <p className={styles.headerMeta}>
            {subtitle ?? "Sales dataset"} ·{" "}
            <span className={styles.status} data-tone={connection.tone}>
              <span className={styles.statusDot} aria-hidden="true" />
              {connection.label}
            </span>
          </p>
        </div>
      </div>
    </header>
  );
}
