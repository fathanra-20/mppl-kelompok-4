"use client";

import { useState } from "react";
import { Plus, Trash2, X, Sparkles, AlertCircle } from "lucide-react";
import type { Product, CartItem, CartIngredient } from "@/lib/types";
import { formatRupiah } from "@/lib/utils";

interface RacikanModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onAddRacikan: (item: CartItem) => void;
}

interface IngredientRow {
  productId: number;
  unitName: string;
  quantity: number;
}

export function RacikanModal({ isOpen, onClose, products, onAddRacikan }: RacikanModalProps) {
  const [compoundName, setCompoundName] = useState("Puyer Flu & Batuk Anak");
  const [packageQty, setPackageQty] = useState(10);
  const [packageUnit, setPackageUnit] = useState("Bungkus");
  const [pricePerPackage, setPricePerPackage] = useState(3500);

  // Initialize with at least 2 default ingredient rows
  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { productId: products[0]?.id || 1, unitName: "TABLET", quantity: 5 },
    { productId: products[2]?.id || 3, unitName: "TABLET", quantity: 5 },
  ]);

  if (!isOpen) return null;

  const handleAddIngredient = () => {
    const firstProd = products[0];
    if (firstProd) {
      setIngredients([
        ...ingredients,
        { productId: firstProd.id, unitName: firstProd.base_unit, quantity: 1 },
      ]);
    }
  };

  const handleRemoveIngredient = (index: number) => {
    if (ingredients.length <= 1) return;
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleUpdateIngredient = (index: number, updates: Partial<IngredientRow>) => {
    const next = [...ingredients];
    next[index] = { ...next[index], ...updates };

    // Reset unit to product's first unit if product changed
    if (updates.productId) {
      const prod = products.find((p) => p.id === updates.productId);
      if (prod && prod.units.length > 0) {
        next[index].unitName = prod.units[0].unit_name;
      }
    }
    setIngredients(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Map ingredients to CartIngredient format with base units calculated
    const resolvedIngredients: CartIngredient[] = ingredients.map((row) => {
      const prod = products.find((p) => p.id === row.productId);
      const unit = prod?.units.find((u) => u.unit_name.toUpperCase() === row.unitName.toUpperCase());
      const factor = unit?.conversion_factor || 1;
      return {
        product_id: row.productId,
        product_name: prod?.name || "Bahan",
        unit_name: row.unitName,
        quantity: row.quantity,
        conversion_factor: factor,
        base_units: row.quantity * factor,
      };
    });

    const subtotal = packageQty * pricePerPackage;

    const racikanCartItem: CartItem = {
      id: `racikan-${Date.now()}`,
      item_type: "RACIKAN",
      item_name: compoundName,
      unit_name: packageUnit.toUpperCase(),
      quantity: packageQty,
      unit_price: pricePerPackage,
      subtotal,
      ingredients: resolvedIngredients,
    };

    onAddRacikan(racikanCartItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Buat Resep Racikan (Compounded)</h2>
              <p className="text-xs text-muted-foreground">Komposisi Bill-of-Materials (BOM) obat racik</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Compound Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nama Racikan</label>
              <input
                type="text"
                required
                value={compoundName}
                onChange={(e) => setCompoundName(e.target.value)}
                placeholder="Contoh: Puyer Flu & Batuk Anak"
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Bentuk Kemasan</label>
              <select
                value={packageUnit}
                onChange={(e) => setPackageUnit(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Bungkus">Bungkus (Puyer)</option>
                <option value="Kapsul">Kapsul</option>
                <option value="Botol">Botol Sirup</option>
                <option value="Pot">Pot Salep</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Jumlah Paket ({packageUnit})</label>
              <input
                type="number"
                min="1"
                required
                value={packageQty}
                onChange={(e) => setPackageQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Harga Jual per {packageUnit}</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">Rp</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={pricePerPackage}
                  onChange={(e) => setPricePerPackage(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full h-10 pl-9 pr-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* BOM Ingredients */}
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Bahan Baku / Obat yang Digerus (BOM)
              </span>
              <button
                type="button"
                onClick={handleAddIngredient}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-md"
              >
                <Plus className="h-3.5 w-3.5" />
                Tambah Bahan
              </button>
            </div>

            <div className="space-y-2.5">
              {ingredients.map((row, idx) => {
                const prod = products.find((p) => p.id === row.productId);
                const unit = prod?.units.find((u) => u.unit_name === row.unitName);
                const factor = unit?.conversion_factor || 1;
                const neededBase = row.quantity * factor;
                const isOutOfStock = prod ? neededBase > prod.total_stock_base : false;

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 rounded-lg border border-border bg-muted/20"
                  >
                    {/* Product Select */}
                    <div className="flex-1 w-full">
                      <select
                        value={row.productId}
                        onChange={(e) => handleUpdateIngredient(idx, { productId: parseInt(e.target.value) })}
                        className="w-full h-9 px-2.5 rounded-md border border-input bg-background text-xs focus:ring-1 focus:ring-emerald-500"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Stok: {p.total_stock_base} {p.base_unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Unit Select */}
                    <div className="w-28">
                      <select
                        value={row.unitName}
                        onChange={(e) => handleUpdateIngredient(idx, { unitName: e.target.value })}
                        className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs focus:ring-1 focus:ring-emerald-500"
                      >
                        {prod?.units.map((u) => (
                          <option key={u.id} value={u.unit_name}>
                            {u.unit_name} ({u.conversion_factor} {prod.base_unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Qty Input */}
                    <div className="w-24">
                      <input
                        type="number"
                        min="1"
                        value={row.quantity}
                        onChange={(e) =>
                          handleUpdateIngredient(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })
                        }
                        className="w-full h-9 px-2 rounded-md border border-input bg-background text-xs text-center focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Delete button */}
                    <button
                      type="button"
                      disabled={ingredients.length <= 1}
                      onClick={() => handleRemoveIngredient(idx)}
                      className="h-9 w-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>

                    {isOutOfStock && (
                      <div className="w-full flex items-center gap-1 text-[11px] text-rose-600 font-medium">
                        <AlertCircle className="h-3 w-3" />
                        Stok tidak cukup (butuh {neededBase} {prod?.base_unit}, tersedia {prod?.total_stock_base})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Subtotal preview */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-500/20">
            <span className="text-xs text-muted-foreground">Total Biaya Racikan:</span>
            <span className="text-base font-bold text-emerald-600">
              {formatRupiah(packageQty * pricePerPackage)}
            </span>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-input text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all"
            >
              + Masukkan ke Kasir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
