import { supabase, isSupabaseConfigured } from "./supabase";
import type { Product, CheckoutPayload } from "./types";

// Realistic baseline seed data for Indonesian Pharmacy
const INITIAL_PRODUCTS: Product[] = [
  {
    id: 1,
    sku: "MED-001",
    name: "Paracetamol 500mg",
    category: "Analgesik & Antipiretik",
    base_unit: "TABLET",
    min_stock_alert: 50,
    units: [
      { id: 1, product_id: 1, unit_name: "TABLET", conversion_factor: 1, price: 1000, is_base_unit: true },
      { id: 2, product_id: 1, unit_name: "STRIP", conversion_factor: 10, price: 9500, is_base_unit: false },
      { id: 3, product_id: 1, unit_name: "BOX", conversion_factor: 100, price: 90000, is_base_unit: false },
    ],
    batches: [
      { id: 1, product_id: 1, batch_number: "B-PCT-202610-01", expiry_date: "2026-10-05", stock_base_unit: 45 },
      { id: 2, product_id: 1, batch_number: "B-PCT-202701-02", expiry_date: "2027-01-20", stock_base_unit: 180 },
    ],
    total_stock_base: 225,
  },
  {
    id: 2,
    sku: "MED-002",
    name: "Amoxicillin 500mg",
    category: "Antibiotik",
    base_unit: "TABLET",
    min_stock_alert: 50,
    units: [
      { id: 4, product_id: 2, unit_name: "TABLET", conversion_factor: 1, price: 1500, is_base_unit: true },
      { id: 5, product_id: 2, unit_name: "STRIP", conversion_factor: 10, price: 14000, is_base_unit: false },
      { id: 6, product_id: 2, unit_name: "BOX", conversion_factor: 100, price: 130000, is_base_unit: false },
    ],
    batches: [
      { id: 3, product_id: 2, batch_number: "B-AMX-202611-01", expiry_date: "2026-11-10", stock_base_unit: 30 },
      { id: 4, product_id: 2, batch_number: "B-AMX-202703-02", expiry_date: "2027-03-15", stock_base_unit: 250 },
    ],
    total_stock_base: 280,
  },
  {
    id: 3,
    sku: "MED-003",
    name: "Ambroxol 30mg",
    category: "Batuk & Flu",
    base_unit: "TABLET",
    min_stock_alert: 30,
    units: [
      { id: 7, product_id: 3, unit_name: "TABLET", conversion_factor: 1, price: 800, is_base_unit: true },
      { id: 8, product_id: 3, unit_name: "STRIP", conversion_factor: 10, price: 7500, is_base_unit: false },
      { id: 9, product_id: 3, unit_name: "BOX", conversion_factor: 100, price: 70000, is_base_unit: false },
    ],
    batches: [
      { id: 5, product_id: 3, batch_number: "B-AMB-202612-01", expiry_date: "2026-12-30", stock_base_unit: 90 },
      { id: 6, product_id: 3, batch_number: "B-AMB-202705-02", expiry_date: "2027-05-18", stock_base_unit: 200 },
    ],
    total_stock_base: 290,
  },
  {
    id: 4,
    sku: "MED-004",
    name: "CTM 4mg",
    category: "Antihistamin",
    base_unit: "TABLET",
    min_stock_alert: 100,
    units: [
      { id: 10, product_id: 4, unit_name: "TABLET", conversion_factor: 1, price: 300, is_base_unit: true },
      { id: 11, product_id: 4, unit_name: "BOTOL", conversion_factor: 1000, price: 250000, is_base_unit: false },
    ],
    batches: [
      { id: 7, product_id: 4, batch_number: "B-CTM-202706-01", expiry_date: "2027-06-30", stock_base_unit: 850 },
    ],
    total_stock_base: 850,
  },
  {
    id: 5,
    sku: "MED-005",
    name: "Cetirizine 10mg",
    category: "Antihistamin",
    base_unit: "TABLET",
    min_stock_alert: 30,
    units: [
      { id: 12, product_id: 5, unit_name: "TABLET", conversion_factor: 1, price: 1800, is_base_unit: true },
      { id: 13, product_id: 5, unit_name: "STRIP", conversion_factor: 10, price: 17000, is_base_unit: false },
    ],
    batches: [
      { id: 8, product_id: 5, batch_number: "B-CET-202610-15", expiry_date: "2026-10-15", stock_base_unit: 20 },
      { id: 9, product_id: 5, batch_number: "B-CET-202704-01", expiry_date: "2027-04-10", stock_base_unit: 120 },
    ],
    total_stock_base: 140,
  },
  {
    id: 6,
    sku: "MED-006",
    name: "Vitamin C 500mg",
    category: "Vitamin & Suplemen",
    base_unit: "TABLET",
    min_stock_alert: 50,
    units: [
      { id: 14, product_id: 6, unit_name: "TABLET", conversion_factor: 1, price: 1200, is_base_unit: true },
      { id: 15, product_id: 6, unit_name: "STRIP", conversion_factor: 10, price: 11000, is_base_unit: false },
      { id: 16, product_id: 6, unit_name: "BOX", conversion_factor: 100, price: 105000, is_base_unit: false },
    ],
    batches: [
      { id: 10, product_id: 6, batch_number: "B-VTC-202708-01", expiry_date: "2027-08-25", stock_base_unit: 300 },
    ],
    total_stock_base: 300,
  },
];

let localProducts: Product[] = JSON.parse(JSON.stringify(INITIAL_PRODUCTS));

/**
 * Fetch all products with their units and batches (sorted by FEFO: expiry_date ASC)
 */
export async function getProducts(): Promise<Product[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("products")
      .select(`
        id, sku, name, category, base_unit, min_stock_alert,
        units:product_units(id, product_id, unit_name, conversion_factor, price, is_base_unit),
        batches:product_batches(id, product_id, batch_number, expiry_date, stock_base_unit)
      `)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.warn("Supabase fetch failed, falling back to local dataset:", error.message);
      return localProducts;
    }

    return (data || []).map((p: any) => {
      const sortedBatches = (p.batches || []).sort(
        (a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      );
      const totalStock = sortedBatches.reduce((acc: number, b: any) => acc + (b.stock_base_unit || 0), 0);
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        base_unit: p.base_unit,
        min_stock_alert: p.min_stock_alert,
        units: p.units || [],
        batches: sortedBatches,
        total_stock_base: totalStock,
      };
    });
  }

  // Local fallback
  return JSON.parse(JSON.stringify(localProducts));
}

/**
 * Execute checkout: runs Supabase RPC 'checkout_sale' or local FEFO deduction
 */
export async function processCheckout(payload: CheckoutPayload): Promise<{ success: boolean; invoice_number: string }> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.rpc("checkout_sale", {
      payload: {
        invoice_number: payload.invoice_number,
        customer_name: payload.customer_name,
        payment_method: payload.payment_method,
        cash_received: payload.cash_received,
        change_amount: payload.change_amount,
        total_amount: payload.total_amount,
        items: payload.items.map((item) => ({
          item_type: item.item_type,
          product_id: item.product_id || null,
          item_name: item.item_name,
          unit_name: item.unit_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          ingredients: (item.ingredients || []).map((ing) => ({
            product_id: ing.product_id,
            unit_name: ing.unit_name,
            quantity: ing.quantity,
          })),
        })),
      },
    });

    if (error) {
      throw new Error(error.message);
    }
    return { success: true, invoice_number: data?.invoice_number || payload.invoice_number };
  }

  // Local FEFO deduction logic
  for (const item of payload.items) {
    if (item.item_type === "STANDARD" && item.product_id) {
      const prod = localProducts.find((p) => p.id === item.product_id);
      if (!prod) throw new Error(`Produk ID ${item.product_id} tidak ditemukan.`);
      const unit = prod.units.find((u) => u.unit_name.toUpperCase() === item.unit_name.toUpperCase());
      const factor = unit ? unit.conversion_factor : 1;
      let remaining = item.quantity * factor;

      // Sort batches FEFO
      prod.batches.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

      for (const batch of prod.batches) {
        if (remaining <= 0) break;
        if (batch.stock_base_unit <= 0) continue;
        const deduct = Math.min(remaining, batch.stock_base_unit);
        batch.stock_base_unit -= deduct;
        remaining -= deduct;
      }

      if (remaining > 0) {
        throw new Error(`Stok tidak mencukupi untuk ${item.item_name}`);
      }

      prod.total_stock_base = prod.batches.reduce((sum, b) => sum + b.stock_base_unit, 0);
    } else if (item.item_type === "RACIKAN" && item.ingredients) {
      for (const ing of item.ingredients) {
        const prod = localProducts.find((p) => p.id === ing.product_id);
        if (!prod) throw new Error(`Bahan baku ${ing.product_name} tidak ditemukan.`);
        let remaining = ing.base_units;

        prod.batches.sort((a, b) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime());

        for (const batch of prod.batches) {
          if (remaining <= 0) break;
          if (batch.stock_base_unit <= 0) continue;
          const deduct = Math.min(remaining, batch.stock_base_unit);
          batch.stock_base_unit -= deduct;
          remaining -= deduct;
        }

        if (remaining > 0) {
          throw new Error(`Bahan racikan '${ing.product_name}' tidak mencukupi.`);
        }

        prod.total_stock_base = prod.batches.reduce((sum, b) => sum + b.stock_base_unit, 0);
      }
    }
  }

  return { success: true, invoice_number: payload.invoice_number };
}
