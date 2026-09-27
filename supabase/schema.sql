-- ============================================================================
-- Supabase PostgreSQL Schema & RPC for SIMA Pharmacy Management System
-- Includes Tables, Constraints, FEFO Partial Indexes, Checkout RPC & Seed Data
-- ============================================================================

-- Drop previous tables if existing
DROP FUNCTION IF EXISTS checkout_sale(JSONB);
DROP TABLE IF EXISTS stock_mutations CASCADE;
DROP TABLE IF EXISTS transaction_batch_allocations CASCADE;
DROP TABLE IF EXISTS racikan_ingredients CASCADE;
DROP TABLE IF EXISTS transaction_items CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS product_batches CASCADE;
DROP TABLE IF EXISTS product_units CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 1. PRODUCTS
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Obat Bebas',
    base_unit VARCHAR(50) NOT NULL, -- e.g. TABLET, KAPSUL, BOTOL, AMPUL, ML
    min_stock_alert INTEGER NOT NULL DEFAULT 20,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_category ON products(category);

-- 2. PRODUCT UNITS (Multi-unit conversion to base units)
CREATE TABLE product_units (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    unit_name VARCHAR(50) NOT NULL,
    conversion_factor INTEGER NOT NULL CHECK (conversion_factor > 0),
    price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    is_base_unit BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_unit UNIQUE (product_id, unit_name)
);

CREATE INDEX idx_product_units_prod ON product_units(product_id);

-- 3. PRODUCT BATCHES (FEFO Tracking)
CREATE TABLE product_batches (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    stock_base_unit INTEGER NOT NULL CHECK (stock_base_unit >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_batch UNIQUE (product_id, batch_number)
);

CREATE INDEX idx_product_batches_fefo 
ON product_batches (product_id, expiry_date ASC, id ASC) 
WHERE stock_base_unit > 0;

-- 4. SALES TRANSACTIONS
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    customer_name VARCHAR(255) DEFAULT 'Umum / Walk-in',
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'TUNAI',
    cash_received NUMERIC(12, 2) DEFAULT 0,
    change_amount NUMERIC(12, 2) DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. TRANSACTION ITEMS
CREATE TABLE transaction_items (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('STANDARD', 'RACIKAN')),
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    item_name VARCHAR(255) NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. RACIKAN INGREDIENTS (BOM)
CREATE TABLE racikan_ingredients (
    id BIGSERIAL PRIMARY KEY,
    transaction_item_id BIGINT NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_name VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_base_unit INTEGER NOT NULL CHECK (quantity_base_unit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. STOCK MUTATIONS (Immutable Audit Log)
CREATE TABLE stock_mutations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id BIGINT NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    mutation_type VARCHAR(30) NOT NULL CHECK (
        mutation_type IN ('SALE', 'SALE_RACIKAN', 'PURCHASE_RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
    ),
    quantity_delta INTEGER NOT NULL,
    stock_before INTEGER NOT NULL,
    stock_after INTEGER NOT NULL,
    reference_table VARCHAR(50),
    reference_id BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 8. SUPABASE RPC: Atomic Checkout Function with FEFO Deductions
-- ============================================================================
CREATE OR REPLACE FUNCTION checkout_sale(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_invoice VARCHAR(50);
    v_customer VARCHAR(255);
    v_payment_method VARCHAR(30);
    v_cash_received NUMERIC;
    v_change_amount NUMERIC;
    v_total_amount NUMERIC;
    v_transaction_id BIGINT;
    v_item RECORD;
    v_ing RECORD;
    v_batch RECORD;
    v_item_id BIGINT;
    v_needed_base_units INTEGER;
    v_remaining_deduct INTEGER;
    v_deduct_qty INTEGER;
    v_subtotal NUMERIC;
    v_factor INTEGER;
BEGIN
    v_invoice := payload->>'invoice_number';
    v_customer := COALESCE(payload->>'customer_name', 'Umum / Walk-in');
    v_payment_method := COALESCE(payload->>'payment_method', 'TUNAI');
    v_cash_received := COALESCE((payload->>'cash_received')::NUMERIC, 0);
    v_change_amount := COALESCE((payload->>'change_amount')::NUMERIC, 0);
    v_total_amount := (payload->>'total_amount')::NUMERIC;

    -- 1. Insert Transaction Header
    INSERT INTO transactions (
        invoice_number, customer_name, total_amount, payment_method, cash_received, change_amount, status
    ) VALUES (
        v_invoice, v_customer, v_total_amount, v_payment_method, v_cash_received, v_change_amount, 'COMPLETED'
    ) RETURNING id INTO v_transaction_id;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(payload->'items') AS x(
        item_type VARCHAR,
        product_id BIGINT,
        item_name VARCHAR,
        unit_name VARCHAR,
        quantity INTEGER,
        unit_price NUMERIC,
        ingredients JSONB
    )
    LOOP
        v_subtotal := v_item.unit_price * v_item.quantity;

        -- Insert Line Item
        INSERT INTO transaction_items (
            transaction_id, item_type, product_id, item_name, unit_name, quantity, unit_price, subtotal
        ) VALUES (
            v_transaction_id, v_item.item_type, v_item.product_id, v_item.item_name, v_item.unit_name, v_item.quantity, v_item.unit_price, v_subtotal
        ) RETURNING id INTO v_item_id;

        -- CASE A: STANDARD ITEM
        IF v_item.item_type = 'STANDARD' THEN
            -- Lookup conversion factor
            SELECT conversion_factor INTO v_factor
            FROM product_units
            WHERE product_id = v_item.product_id AND UPPER(unit_name) = UPPER(v_item.unit_name);

            IF v_factor IS NULL THEN
                v_factor := 1;
            END IF;

            v_needed_base_units := v_item.quantity * v_factor;
            v_remaining_deduct := v_needed_base_units;

            -- Deduct via FEFO
            FOR v_batch IN 
                SELECT id, stock_base_unit 
                FROM product_batches 
                WHERE product_id = v_item.product_id AND stock_base_unit > 0 
                ORDER BY expiry_date ASC, id ASC 
                FOR UPDATE 
            LOOP
                EXIT WHEN v_remaining_deduct <= 0;
                v_deduct_qty := LEAST(v_remaining_deduct, v_batch.stock_base_unit);

                UPDATE product_batches 
                SET stock_base_unit = stock_base_unit - v_deduct_qty
                WHERE id = v_batch.id;

                INSERT INTO stock_mutations (
                    product_id, batch_id, mutation_type, quantity_delta,
                    stock_before, stock_after, reference_table, reference_id, notes
                ) VALUES (
                    v_item.product_id, v_batch.id, 'SALE', -v_deduct_qty,
                    v_batch.stock_base_unit, v_batch.stock_base_unit - v_deduct_qty,
                    'transactions', v_transaction_id, 'Invoice: ' || v_invoice
                );

                v_remaining_deduct := v_remaining_deduct - v_deduct_qty;
            END LOOP;

            IF v_remaining_deduct > 0 THEN
                RAISE EXCEPTION 'Stok tidak mencukupi untuk %', v_item.item_name;
            END IF;

        -- CASE B: RACIKAN ITEM (Compounded Prescription BOM)
        ELSIF v_item.item_type = 'RACIKAN' THEN
            FOR v_ing IN SELECT * FROM jsonb_to_recordset(v_item.ingredients) AS y(
                product_id BIGINT,
                unit_name VARCHAR,
                quantity INTEGER
            )
            LOOP
                SELECT conversion_factor INTO v_factor
                FROM product_units
                WHERE product_id = v_ing.product_id AND UPPER(unit_name) = UPPER(v_ing.unit_name);

                IF v_factor IS NULL THEN
                    v_factor := 1;
                END IF;

                v_needed_base_units := v_ing.quantity * v_factor;

                INSERT INTO racikan_ingredients (
                    transaction_item_id, product_id, unit_name, quantity, quantity_base_unit
                ) VALUES (
                    v_item_id, v_ing.product_id, v_ing.unit_name, v_ing.quantity, v_needed_base_units
                );

                v_remaining_deduct := v_needed_base_units;

                FOR v_batch IN 
                    SELECT id, stock_base_unit 
                    FROM product_batches 
                    WHERE product_id = v_ing.product_id AND stock_base_unit > 0 
                    ORDER BY expiry_date ASC, id ASC 
                    FOR UPDATE 
                LOOP
                    EXIT WHEN v_remaining_deduct <= 0;
                    v_deduct_qty := LEAST(v_remaining_deduct, v_batch.stock_base_unit);

                    UPDATE product_batches 
                    SET stock_base_unit = stock_base_unit - v_deduct_qty
                    WHERE id = v_batch.id;

                    INSERT INTO stock_mutations (
                        product_id, batch_id, mutation_type, quantity_delta,
                        stock_before, stock_after, reference_table, reference_id, notes
                    ) VALUES (
                        v_ing.product_id, v_batch.id, 'SALE_RACIKAN', -v_deduct_qty,
                        v_batch.stock_base_unit, v_batch.stock_base_unit - v_deduct_qty,
                        'transactions', v_transaction_id, 'Racikan: ' || v_item.item_name
                    );

                    v_remaining_deduct := v_remaining_deduct - v_deduct_qty;
                END LOOP;

                IF v_remaining_deduct > 0 THEN
                    RAISE EXCEPTION 'Bahan racikan ID % tidak mencukupi', v_ing.product_id;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'invoice_number', v_invoice,
        'total_amount', v_total_amount
    );
END;
$$;

-- ============================================================================
-- 9. REALISTIC SEED DATA (Apotek Indonesia)
-- ============================================================================
INSERT INTO products (sku, name, category, base_unit, min_stock_alert) VALUES
('MED-001', 'Paracetamol 500mg', 'Analgesik & Antipiretik', 'TABLET', 50),
('MED-002', 'Amoxicillin 500mg', 'Antibiotik', 'TABLET', 50),
('MED-003', 'Ambroxol 30mg', 'Batuk & Flu', 'TABLET', 30),
('MED-004', 'CTM 4mg', 'Antihistamin', 'TABLET', 100),
('MED-005', 'Cetirizine 10mg', 'Antihistamin', 'TABLET', 30),
('MED-006', 'Vitamin C 500mg', 'Vitamin & Suplemen', 'TABLET', 50);

-- Multi-Unit configurations
INSERT INTO product_units (product_id, unit_name, conversion_factor, price, is_base_unit) VALUES
-- Paracetamol: Tablet, Strip (10), Box (100)
(1, 'TABLET', 1, 1000.00, true),
(1, 'STRIP', 10, 9500.00, false),
(1, 'BOX', 100, 90000.00, false),

-- Amoxicillin: Tablet, Strip (10), Box (100)
(2, 'TABLET', 1, 1500.00, true),
(2, 'STRIP', 10, 14000.00, false),
(2, 'BOX', 100, 130000.00, false),

-- Ambroxol: Tablet, Strip (10), Box (100)
(3, 'TABLET', 1, 800.00, true),
(3, 'STRIP', 10, 7500.00, false),
(3, 'BOX', 100, 70000.00, false),

-- CTM: Tablet, Botol (1000)
(4, 'TABLET', 1, 300.00, true),
(4, 'BOTOL', 1000, 250000.00, false),

-- Cetirizine: Tablet, Strip (10)
(5, 'TABLET', 1, 1800.00, true),
(5, 'STRIP', 10, 17000.00, false),

-- Vitamin C: Tablet, Strip (10), Box (100)
(6, 'TABLET', 1, 1200.00, true),
(6, 'STRIP', 10, 11000.00, false),
(6, 'BOX', 100, 105000.00, false);

-- Batches highlighting FEFO visualization:
-- Notice: Batch PCT-202610 expires in ~10 days (CRITICAL / RED)
-- Notice: Batch AMX-202611 expires in ~45 days (WARNING / AMBER)
-- Others expire in 2027 (SAFE / GREEN)
INSERT INTO product_batches (product_id, batch_number, expiry_date, stock_base_unit) VALUES
(1, 'B-PCT-202610-01', '2026-10-05', 45),   -- Expiring in ~10 days (FEFO Priority 1)
(1, 'B-PCT-202701-02', '2027-01-20', 180),  -- Expiring in 2027 (FEFO Priority 2)

(2, 'B-AMX-202611-01', '2026-11-10', 30),   -- Expiring in ~45 days (FEFO Priority 1)
(2, 'B-AMX-202703-02', '2027-03-15', 250),  -- Expiring in 2027

(3, 'B-AMB-202612-01', '2026-12-30', 90),
(3, 'B-AMB-202705-02', '2027-05-18', 200),

(4, 'B-CTM-202706-01', '2027-06-30', 850),

(5, 'B-CET-202610-15', '2026-10-15', 20),   -- Expiring in ~20 days (CRITICAL)
(5, 'B-CET-202704-01', '2027-04-10', 120),

(6, 'B-VTC-202708-01', '2027-08-25', 300);
