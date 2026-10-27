"use client";

import { BookmarkCheck, History, LogOut, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import styles from "./Sidebar.module.css";

const NAV = [
  { href: "/", label: "Ask", icon: MessageSquareText },
  { href: "/history", label: "History", icon: History },
  { href: "/reports", label: "Reports", icon: BookmarkCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark}>s/</span>
        <span className={styles.brandName}>ShopScope</span>
      </Link>

      <ul className={styles.nav}>
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} className={styles.link} aria-current={active ? "page" : undefined}>
                <Icon size={17} strokeWidth={1.75} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {user && (
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">
            {user.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className={styles.who}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.email}>{user.email}</span>
          </span>
          <button type="button" className={styles.logout} onClick={() => void logout()} aria-label="Log out" title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      )}
    </nav>
  );
}
