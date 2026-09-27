-- ============================================================================
-- Production Database Schema for Pharmacy Management System (SIMA)
-- Dialect: PostgreSQL 14+
-- Design Principles: ACID, FEFO Batching, Integer Base-Unit Inventory, Immutable Audit Ledger
-- ============================================================================

-- Drop tables if re-initializing (in reverse dependency order)
DROP TABLE IF EXISTS stock_mutations CASCADE;
DROP TABLE IF EXISTS transaction_batch_allocations CASCADE;
DROP TABLE IF EXISTS racikan_ingredients CASCADE;
DROP TABLE IF EXISTS transaction_items CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS product_batches CASCADE;
DROP TABLE IF EXISTS product_units CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- ----------------------------------------------------------------------------
-- 1. PRODUCTS
-- Core catalog entity. Inventory is strictly tracked in base_unit (e.g. TABLET, ML, PCS).
-- ----------------------------------------------------------------------------
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    base_unit VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_name ON products(name);

-- ----------------------------------------------------------------------------
-- 2. PRODUCT UNITS (Multi-Unit Packaging Conversions)
-- Eliminates fractional rounding errors. Every unit defines conversion_factor 
-- directly to base_unit.
-- Example: Base unit = TABLET. Strip = 10 tablets. Box = 100 tablets.
-- ----------------------------------------------------------------------------
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

CREATE INDEX idx_product_units_product ON product_units(product_id);

-- ----------------------------------------------------------------------------
-- 3. PRODUCT BATCHES (FEFO Inventory Storage)
-- Stock is strictly stored as an INTEGER in base units.
-- Database-level CHECK constraint guarantees stock can NEVER become negative.
-- ----------------------------------------------------------------------------
CREATE TABLE product_batches (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    stock_base_unit INTEGER NOT NULL CHECK (stock_base_unit >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_batch UNIQUE (product_id, batch_number)
);

-- Partial index tailored for FEFO row-locking queries
CREATE INDEX idx_product_batches_fefo 
ON product_batches (product_id, expiry_date ASC, id ASC) 
WHERE stock_base_unit > 0;

-- ----------------------------------------------------------------------------
-- 4. SALES TRANSACTIONS
-- Header for sales transactions (OTC, Prescription, Racikan).
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    customer_name VARCHAR(255),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_invoice ON transactions(invoice_number);

-- ----------------------------------------------------------------------------
-- 5. TRANSACTION ITEMS
-- Line items for sales. Supports STANDARD product lines and RACIKAN compound lines.
-- ----------------------------------------------------------------------------
CREATE TABLE transaction_items (
    id BIGSERIAL PRIMARY KEY,
    transaction_id BIGINT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('STANDARD', 'RACIKAN')),
    product_id BIGINT REFERENCES products(id) ON DELETE RESTRICT,
    item_name VARCHAR(255) NOT NULL,
    unit_name VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transaction_items_tx ON transaction_items(transaction_id);

-- ----------------------------------------------------------------------------
-- 6. RACIKAN INGREDIENTS (Bill of Materials for Compounded Prescriptions)
-- Tracks the specific raw ingredients consumed for a RACIKAN transaction item.
-- ----------------------------------------------------------------------------
CREATE TABLE racikan_ingredients (
    id BIGSERIAL PRIMARY KEY,
    transaction_item_id BIGINT NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    unit_name VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    quantity_base_unit INTEGER NOT NULL CHECK (quantity_base_unit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_racikan_ingredients_item ON racikan_ingredients(transaction_item_id);
CREATE INDEX idx_racikan_ingredients_prod ON racikan_ingredients(product_id);

-- ----------------------------------------------------------------------------
-- 7. TRANSACTION BATCH ALLOCATIONS (Traceability Audit Trail)
-- Maps the exact batch numbers and quantities deducted for each item/ingredient.
-- ----------------------------------------------------------------------------
CREATE TABLE transaction_batch_allocations (
    id BIGSERIAL PRIMARY KEY,
    transaction_item_id BIGINT NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
    racikan_ingredient_id BIGINT REFERENCES racikan_ingredients(id) ON DELETE CASCADE,
    batch_id BIGINT NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    quantity_base_unit INTEGER NOT NULL CHECK (quantity_base_unit > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tba_item ON transaction_batch_allocations(transaction_item_id);
CREATE INDEX idx_tba_batch ON transaction_batch_allocations(batch_id);

-- ----------------------------------------------------------------------------
-- 8. STOCK MUTATIONS (Immutable Inventory Ledger)
-- Double-entry audit log for all stock movements.
-- Never update or delete rows in this table.
-- ----------------------------------------------------------------------------
CREATE TABLE stock_mutations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    batch_id BIGINT NOT NULL REFERENCES product_batches(id) ON DELETE RESTRICT,
    mutation_type VARCHAR(30) NOT NULL CHECK (
        mutation_type IN ('SALE', 'SALE_RACIKAN', 'PURCHASE_RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'RETURN')
    ),
    quantity_delta INTEGER NOT NULL CHECK (quantity_delta != 0),
    stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    reference_table VARCHAR(50),
    reference_id BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stock_mutations_batch ON stock_mutations(batch_id, created_at);
CREATE INDEX idx_stock_mutations_product ON stock_mutations(product_id, created_at);
CREATE INDEX idx_stock_mutations_ref ON stock_mutations(reference_table, reference_id);
