"use client";

import { AppShell } from "@/components/layout/AppShell";
import { HistoryList } from "@/features/history/HistoryList";

export default function HistoryPage() {
  return (
    <AppShell title="Query history">
      <HistoryList />
    </AppShell>
  );
}
