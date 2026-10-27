"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import styles from "./AppShell.module.css";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

// Every signed-in page: sidebar + header + content. Signed-out visitors are sent to /login.
export function AppShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") {
    return (
      <div className={styles.loading} role="status">
        Loading…
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header title={title} subtitle={subtitle} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
