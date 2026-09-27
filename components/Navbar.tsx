"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pill, ShoppingBag, PackageSearch, Activity, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export function Navbar() {
  const pathname = usePathname();
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems = [
    { href: "/", label: "Kasir (POS)", icon: ShoppingBag },
    { href: "/inventory", label: "Inventaris (FEFO)", icon: PackageSearch },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Pill className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-lg text-foreground">SIMA Apotek</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                PRO
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Sistem Manajemen & Kasir Farmasi</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/50">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                <Icon className={cn("h-4 w-4", active ? "text-emerald-600" : "")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Status & Cashier Info */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-mono font-semibold text-foreground">{time || "--:--:--"}</span>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 justify-end">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              FEFO Active
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-border pl-4">
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center text-xs font-bold text-emerald-700 dark:text-emerald-300">
              A1
            </div>
            <div className="hidden md:block text-left text-xs">
              <p className="font-medium text-foreground">Apoteker / Kasir</p>
              <p className="text-muted-foreground text-[10px]">Shift Siang</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
