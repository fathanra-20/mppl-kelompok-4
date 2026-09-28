"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  ShoppingBag,
  CreditCard,
  QrCode,
  Banknote,
  CheckCircle2,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { getProducts, processCheckout } from "@/lib/db";
import type { Product, CartItem } from "@/lib/types";
import { formatRupiah, formatStockHierarchy } from "@/lib/utils";
import { RacikanModal } from "@/components/RacikanModal";

export default function PosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("Umum / Walk-in");
  const [paymentMethod, setPaymentMethod] = useState<"TUNAI" | "QRIS" | "TRANSFER">("TUNAI");
  const [cashReceived, setCashReceived] = useState<number>(0);
  const [isRacikanModalOpen, setIsRacikanModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutSuccess, setCheckoutSuccess] = useState<{ invoice: string; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Generated client-side only, biar ga hydration mismatch (Math.random beda di server vs client)
  const [invoiceNumber, setInvoiceNumber] = useState("");
  useEffect(() => {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    setInvoiceNumber(`INV-${dateStr}-${Math.floor(1000 + Math.random() * 9000)}`);
  }, [checkoutSuccess]);
  
  const loadCatalog = async () => {
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCatalog();
  }, []);

  // Filter products by search and category
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ["Semua", ...Array.from(cats)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === "Semua" || p.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [products, searchQuery, selectedCategory]);

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      // Find smallest unit as default or base unit
      const defaultUnit = product.units.find((u) => u.is_base_unit) || product.units[0];
      const existingIdx = prev.findIndex(
        (item) => item.product_id === product.id && item.unit_name === defaultUnit.unit_name
      );

      if (existingIdx > -1) {
        const next = [...prev];
        const item = next[existingIdx];
        const newQty = item.quantity + 1;
        next[existingIdx] = {
          ...item,
          quantity: newQty,
          subtotal: newQty * item.unit_price,
        };
        return next;
      }

      const newItem: CartItem = {
        id: `std-${product.id}-${defaultUnit.unit_name}-${Date.now()}`,
        item_type: "STANDARD",
        product_id: product.id,
        item_name: product.name,
        unit_name: defaultUnit.unit_name,
        quantity: 1,
        unit_price: defaultUnit.price,
        subtotal: defaultUnit.price,
        available_units: product.units,
      };
      return [...prev, newItem];
    });
  };

  const handleUnitChange = (cartItemId: string, newUnitName: string) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== cartItemId || !item.available_units) return item;
        const matchingUnit = item.available_units.find(
          (u) => u.unit_name.toUpperCase() === newUnitName.toUpperCase()
        );
        if (!matchingUnit) return item;

        return {
          ...item,
          unit_name: matchingUnit.unit_name,
          unit_price: matchingUnit.price,
          subtotal: item.quantity * matchingUnit.price,
        };
      })
    );
  };

  const handleQuantityChange = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== cartItemId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          return {
            ...item,
            quantity: newQty,
            subtotal: newQty * item.unit_price,
          };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== cartItemId));
  };

  const totalAmount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.subtotal, 0);
  }, [cart]);

  const changeAmount = useMemo(() => {
    if (paymentMethod !== "TUNAI" || cashReceived < totalAmount) return 0;
    return cashReceived - totalAmount;
  }, [paymentMethod, cashReceived, totalAmount]);

  // Execute checkout
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await processCheckout({
        invoice_number: invoiceNumber,
        customer_name: customerName,
        payment_method: paymentMethod,
        cash_received: paymentMethod === "TUNAI" ? (cashReceived || totalAmount) : totalAmount,
        change_amount: changeAmount,
        total_amount: totalAmount,
        items: cart,
      });

      setCheckoutSuccess({
        invoice: result.invoice_number,
        total: totalAmount,
      });
      setCart([]);
      setCashReceived(0);
      await loadCatalog(); // Refresh stock counts in background
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal memproses transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* =====================================================================
          LEFT COLUMN: Product Catalog & Search
          ===================================================================== */}
      <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-border bg-card/50 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari obat (Nama, SKU, Barcode)... [F2]"
                className="w-full h-10 pl-9 pr-4 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              onClick={() => setIsRacikanModalOpen(true)}
              className="flex items-center gap-2 h-10 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all whitespace-nowrap"
            >
              <Sparkles className="h-4 w-4" />
              + Racikan (BOM)
            </button>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Memuat katalog obat...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground space-y-2">
              <AlertTriangle className="h-8 w-8 text-amber-500/80" />
              <p className="text-sm font-medium">Tidak ada obat yang cocok.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredProducts.map((p) => {
                const isOutOfStock = p.total_stock_base <= 0;
                const isLowStock = p.total_stock_base <= p.min_stock_alert;
                const baseUnit = p.units.find((u) => u.is_base_unit) || p.units[0];

                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && addToCart(p)}
                    className={`group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all text-left ${
                      isOutOfStock
                        ? "opacity-50 border-border bg-muted/20 cursor-not-allowed"
                        : "border-border bg-card hover:border-emerald-500/50 hover:shadow-md cursor-pointer"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span className="font-mono">{p.sku}</span>
                        <span className="truncate max-w-[120px]">{p.category}</span>
                      </div>
                      <h3 className="font-bold text-sm text-foreground group-hover:text-emerald-600 transition-colors line-clamp-1">
                        {p.name}
                      </h3>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Stok:{" "}
                        <span className={`font-semibold ${isLowStock ? "text-rose-600" : "text-foreground"}`}>
                          {p.total_stock_base} {p.base_unit}
                        </span>{" "}
                        <span className="text-[10px] text-muted-foreground/80">
                          ({formatStockHierarchy(p.total_stock_base, p.units)})
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Mulai dari</span>
                        <span className="text-sm font-bold text-emerald-600">
                          {formatRupiah(baseUnit?.price || 0)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">/{baseUnit?.unit_name}</span>
                      </div>
                      <button
                        disabled={isOutOfStock}
                        className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white flex items-center justify-center transition-all disabled:opacity-0"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          RIGHT COLUMN: Active Cart & Real-time Total
          ===================================================================== */}
      <div className="w-[420px] flex flex-col bg-card shadow-xl overflow-hidden border-l border-border">
        {/* Cart Header */}
        <div className="p-4 border-b border-border bg-muted/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-mono font-bold text-foreground">{invoiceNumber}</span>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-[11px] font-semibold text-rose-600 hover:text-rose-700"
              >
                Kosongkan
              </button>
            )}
          </div>
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Nama Pasien / Pelanggan"
            className="w-full h-8 px-2.5 rounded-md border border-input bg-background text-xs focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-2">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <ShoppingBag className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium">Keranjang Belanja Kosong</p>
              <p className="text-xs text-muted-foreground">
                Klik produk di sebelah kiri atau buat resep racikan.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg border border-border bg-background shadow-sm space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {item.item_type === "RACIKAN" && (
                      <span className="inline-block text-[10px] font-bold text-indigo-700 bg-indigo-50 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 rounded mb-1">
                        RACIKAN (BOM)
                      </span>
                    )}
                    <h4 className="text-xs font-bold text-foreground leading-tight">{item.item_name}</h4>
                    {item.item_type === "RACIKAN" && item.ingredients && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        Bahan: {item.ingredients.map((ing) => `${ing.product_name} (${ing.quantity} ${ing.unit_name})`).join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="text-muted-foreground hover:text-rose-600 p-1 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  {/* Multi-Unit Selector for Standard Items */}
                  {item.item_type === "STANDARD" && item.available_units ? (
                    <select
                      value={item.unit_name}
                      onChange={(e) => handleUnitChange(item.id, e.target.value)}
                      className="h-7 px-2 text-[11px] font-semibold rounded border border-input bg-card text-foreground focus:ring-1 focus:ring-emerald-500"
                    >
                      {item.available_units.map((u) => (
                        <option key={u.id} value={u.unit_name}>
                          {u.unit_name} ({formatRupiah(u.price)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      @{formatRupiah(item.unit_price)}/{item.unit_name}
                    </span>
                  )}

                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-border rounded-md bg-muted/30">
                    <button
                      onClick={() => handleQuantityChange(item.id, -1)}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold font-mono">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantityChange(item.id, 1)}
                      className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Item Subtotal */}
                  <span className="text-xs font-bold font-mono text-emerald-600">
                    {formatRupiah(item.subtotal)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Summary & Checkout */}
        <div className="p-4 border-t border-border bg-card space-y-3">
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950 border border-rose-500/30 text-rose-600 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Payment Method Switcher */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg text-xs font-semibold">
            {[
              { id: "TUNAI", label: "Tunai", icon: Banknote },
              { id: "QRIS", label: "QRIS", icon: QrCode },
              { id: "TRANSFER", label: "Transfer", icon: CreditCard },
            ].map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  onClick={() => setPaymentMethod(p.id as any)}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all ${
                    paymentMethod === p.id
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Cash Input & Change Calculation */}
          {paymentMethod === "TUNAI" && cart.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Uang Diterima:</span>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={cashReceived || ""}
                  onChange={(e) => setCashReceived(parseInt(e.target.value) || 0)}
                  placeholder="Rp 0"
                  className="w-32 h-8 px-2 text-right text-xs font-mono font-bold rounded border border-input bg-background focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              {cashReceived > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Kembalian:</span>
                  <span
                    className={`font-mono font-bold ${
                      changeAmount >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {changeAmount >= 0 ? formatRupiah(changeAmount) : "Uang Kurang"}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Total Bar */}
          <div className="pt-2 border-t border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Tagihan:</span>
            <span className="text-xl font-extrabold font-mono text-emerald-600">
              {formatRupiah(totalAmount)}
            </span>
          </div>

          {/* Big Pay Button */}
          <button
            disabled={cart.length === 0 || isSubmitting}
            onClick={handleCheckout}
            className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span>Memproses Transaksi...</span>
            ) : (
              <>
                <Receipt className="h-4 w-4" />
                <span>Bayar & Cetak Struk (F9)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Racikan Modal */}
      <RacikanModal
        isOpen={isRacikanModalOpen}
        onClose={() => setIsRacikanModalOpen(false)}
        products={products}
        onAddRacikan={(racikanItem) => setCart((prev) => [...prev, racikanItem])}
      />

      {/* Success Notification Modal */}
      {checkoutSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Transaksi Berhasil!</h3>
              <p className="text-xs font-mono text-muted-foreground mt-1">{checkoutSuccess.invoice}</p>
              <p className="text-lg font-extrabold text-emerald-600 font-mono mt-2">
                {formatRupiah(checkoutSuccess.total)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">
                Stok otomatis terpotong menggunakan alokasi FEFO.
              </p>
            </div>
            <button
              onClick={() => setCheckoutSuccess(null)}
              className="w-full h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all"
            >
              Selesai / Transaksi Baru
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
