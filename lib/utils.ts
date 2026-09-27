import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ProductUnit } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getDaysRemaining(expiryDateStr: string): number {
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function getExpiryStatus(expiryDateStr: string): {
  status: "CRITICAL" | "WARNING" | "SAFE" | "EXPIRED";
  label: string;
  badgeClass: string;
  days: number;
} {
  const days = getDaysRemaining(expiryDateStr);

  if (days <= 0) {
    return {
      status: "EXPIRED",
      label: "Kadaluarsa",
      badgeClass: "bg-red-500/10 text-red-600 border-red-500/30",
      days,
    };
  }

  if (days <= 30) {
    return {
      status: "CRITICAL",
      label: `${days} hari lagi`,
      badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/40 font-semibold",
      days,
    };
  }

  if (days <= 90) {
    return {
      status: "WARNING",
      label: `${days} hari lagi`,
      badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
      days,
    };
  }

  return {
    status: "SAFE",
    label: "Aman",
    badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    days,
  };
}

/**
 * Breaks down base unit stock into highest packaging units.
 * Example: 235 Tablets -> "2 Box, 3 Strip, 5 Tab"
 */
export function formatStockHierarchy(totalBaseUnits: number, units: ProductUnit[]): string {
  if (!units || units.length === 0 || totalBaseUnits <= 0) {
    return "0";
  }

  // Sort units descending by conversion_factor
  const sorted = [...units].sort((a, b) => b.conversion_factor - a.conversion_factor);
  const parts: string[] = [];
  let remainder = totalBaseUnits;

  for (const u of sorted) {
    if (u.conversion_factor <= 0) continue;
    const count = Math.floor(remainder / u.conversion_factor);
    remainder = remainder % u.conversion_factor;
    if (count > 0) {
      parts.push(`${count} ${u.unit_name}`);
    }
  }

  return parts.length > 0 ? parts.join(", ") : `0 ${sorted[sorted.length - 1]?.unit_name || ""}`;
}
