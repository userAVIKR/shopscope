"use client";

import { AppShell } from "@/components/layout/AppShell";
import { SavedReports } from "@/features/reports/SavedReports";

export default function ReportsPage() {
  return (
    <AppShell title="Saved reports">
      <SavedReports />
    </AppShell>
  );
}
