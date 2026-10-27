"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AnalyticsPanel } from "@/features/analytics/AnalyticsPanel";

// "Ask again" from history links here with ?q=<question>.
function Dashboard() {
  const question = useSearchParams().get("q") ?? undefined;
  return <AnalyticsPanel key={question} initialQuestion={question} />;
}

export default function HomePage() {
  return (
    <AppShell title="ShopScope Analytics">
      <Suspense>
        <Dashboard />
      </Suspense>
    </AppShell>
  );
}
