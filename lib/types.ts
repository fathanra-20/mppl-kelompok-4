export interface ProductUnit {
  id: number;
  product_id: number;
  unit_name: string;
  conversion_factor: number;
  price: number;
  is_base_unit: boolean;
}

export interface ProductBatch {
  id: number;
  product_id: number;
  batch_number: string;
  expiry_date: string;
  stock_base_unit: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  base_unit: string;
  min_stock_alert: number;
  units: ProductUnit[];
  batches: ProductBatch[];
  total_stock_base: number;
}

export interface CartIngredient {
  product_id: number;
  product_name: string;
  unit_name: string;
  quantity: number;
  conversion_factor: number;
  base_units: number;
}

export interface CartItem {
  id: string; // unique cart row id
  item_type: "STANDARD" | "RACIKAN";
  product_id?: number;
  item_name: string;
  unit_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  available_units?: ProductUnit[];
  ingredients?: CartIngredient[];
}

export interface CheckoutPayload {
  invoice_number: string;
  customer_name: string;
  payment_method: "TUNAI" | "QRIS" | "TRANSFER";
  cash_received: number;
  change_amount: number;
  total_amount: number;
  items: CartItem[];
}
