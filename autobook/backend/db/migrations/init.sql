-- =============================================================================
-- FULL SCHEMA — auto-run by Postgres on first init (empty volume)
-- =============================================================================

BEGIN;

-- ── Enum types ──────────────────────────────────────────────────────────────

CREATE TYPE integrationplatform AS ENUM ('stripe', 'wise', 'plaid', 'shopify', 'lemonsqueezy', 'paddle');
CREATE TYPE integrationstatus AS ENUM ('active', 'inactive', 'error');
CREATE TYPE documenttype AS ENUM ('dividend_resolution', 'directors_resolution', 'annual_return', 'articles_of_amendment', 't5_slip');
CREATE TYPE documentstatus AS ENUM ('draft', 'signed');
CREATE TYPE reconciliationstatus AS ENUM ('auto_matched', 'user_confirmed', 'manual', 'discrepancy');
CREATE TYPE taxtype AS ENUM ('hst', 'gst', 'pst', 'corporate_income');
CREATE TYPE taxobligationstatus AS ENUM ('accruing', 'calculated', 'filed', 'paid');

-- ── Independent tables ──────────────────────────────────────────────────────

CREATE TABLE calibration_params (
    id UUID NOT NULL PRIMARY KEY,
    a FLOAT NOT NULL,
    b FLOAT NOT NULL,
    sample_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE organizations (
    id UUID NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    incorporation_date DATE,
    fiscal_year_end DATE NOT NULL,
    jurisdiction VARCHAR(50) NOT NULL,
    hst_registration_number VARCHAR(50),
    business_number VARCHAR(20),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE users (
    id UUID NOT NULL PRIMARY KEY,
    cognito_sub VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_authenticated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_users_cognito_sub ON users (cognito_sub);
CREATE INDEX ix_users_email ON users (email);

-- ── Tables depending on users ───────────────────────────────────────────────

CREATE TABLE assets (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    acquisition_date DATE NOT NULL,
    acquisition_cost NUMERIC(15, 2) NOT NULL,
    cca_class VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE auth_sessions (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    cognito_sub VARCHAR(255) NOT NULL,
    token_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    token_use VARCHAR(20) NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX ix_auth_sessions_cognito_sub ON auth_sessions (cognito_sub);
CREATE INDEX ix_auth_sessions_token_fingerprint ON auth_sessions (token_fingerprint);

CREATE TABLE chart_of_accounts (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    auto_created BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT uq_chart_of_accounts_user_code UNIQUE (user_id, account_code),
    CONSTRAINT ck_chart_of_accounts_account_type CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE TABLE scheduled_entries (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    amount NUMERIC(15, 2),
    frequency VARCHAR(20) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    next_run_date DATE NOT NULL,
    template_journal_entry JSONB NOT NULL,
    source VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE transactions (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    normalized_description TEXT,
    amount NUMERIC(15, 2),
    currency VARCHAR(3) DEFAULT 'CAD' NOT NULL,
    date DATE NOT NULL,
    source VARCHAR(50) NOT NULL,
    counterparty VARCHAR(255),
    amount_mentions JSONB,
    date_mentions JSONB,
    party_mentions JSONB,
    quantity_mentions JSONB,
    intent_label VARCHAR(100),
    entities JSONB,
    bank_category VARCHAR(100),
    cca_class_match VARCHAR(50),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ── Tables depending on transactions ────────────────────────────────────────

CREATE TABLE clarification_tasks (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    source_text TEXT NOT NULL,
    explanation TEXT NOT NULL,
    confidence NUMERIC(4, 3) NOT NULL,
    proposed_entry JSONB,
    evaluator_verdict VARCHAR(20) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE journal_entries (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions (id) ON DELETE SET NULL,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft' NOT NULL,
    origin_tier INTEGER,
    confidence NUMERIC(4, 3),
    rationale TEXT,
    posted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT ck_journal_entries_status CHECK (status IN ('draft', 'posted')),
    CONSTRAINT ck_journal_entries_origin_tier CHECK (origin_tier IS NULL OR origin_tier BETWEEN 1 AND 4),
    CONSTRAINT ck_journal_entries_confidence CHECK (confidence IS NULL OR (confidence >= 0.000 AND confidence <= 1.000))
);

-- ── Tables depending on journal_entries ─────────────────────────────────────

CREATE TABLE journal_lines (
    id UUID NOT NULL PRIMARY KEY,
    journal_entry_id UUID NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    line_order INTEGER DEFAULT 0 NOT NULL,
    CONSTRAINT ck_journal_lines_type CHECK (type IN ('debit', 'credit')),
    CONSTRAINT ck_journal_lines_amount_positive CHECK (amount > 0)
);

CREATE TABLE cca_schedule_entries (
    id UUID NOT NULL PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL,
    ucc_opening NUMERIC(15, 2) NOT NULL,
    additions NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    dispositions NUMERIC(15, 2) DEFAULT 0 NOT NULL,
    cca_claimed NUMERIC(15, 2) NOT NULL,
    ucc_closing NUMERIC(15, 2) NOT NULL,
    half_year_rule_applied BOOLEAN DEFAULT false NOT NULL,
    journal_entry_id UUID REFERENCES journal_entries (id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- ── Tables depending on organizations ───────────────────────────────────────

CREATE TABLE integration_connections (
    id UUID NOT NULL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    platform integrationplatform NOT NULL,
    credentials TEXT,
    status integrationstatus NOT NULL,
    last_sync TIMESTAMP WITHOUT TIME ZONE,
    webhook_secret VARCHAR(255),
    config JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE corporate_documents (
    id UUID NOT NULL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    document_type documenttype NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    generated_file_path VARCHAR(500),
    related_journal_entry_id UUID REFERENCES journal_entries (id),
    status documentstatus NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE reconciliation_records (
    id UUID NOT NULL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    bank_transaction_id VARCHAR(255),
    platform_transaction_ids VARCHAR(255)[],
    status reconciliationstatus NOT NULL,
    matched_amount NUMERIC(19, 4),
    discrepancy_amount NUMERIC(19, 4),
    journal_entry_id UUID REFERENCES journal_entries (id),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE shareholder_loan_ledger (
    id UUID NOT NULL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    shareholder_name VARCHAR(255) NOT NULL,
    transaction_date DATE NOT NULL,
    amount NUMERIC(19, 4) NOT NULL,
    description TEXT,
    journal_entry_id UUID REFERENCES journal_entries (id),
    running_balance NUMERIC(19, 4) NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE tax_obligations (
    id UUID NOT NULL PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    tax_type taxtype NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount_collected NUMERIC(19, 4) NOT NULL,
    itcs_claimed NUMERIC(19, 4) NOT NULL,
    net_owing NUMERIC(19, 4) NOT NULL,
    status taxobligationstatus NOT NULL,
    payment_journal_entry_id UUID REFERENCES journal_entries (id),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
);

-- ── Taxonomy (shared IFRS categories) ─────────────────────────────────────

CREATE TABLE taxonomy (
    id UUID NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    is_default BOOLEAN DEFAULT false NOT NULL,
    user_id UUID REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT uq_taxonomy_name_type UNIQUE (name, account_type),
    CONSTRAINT ck_taxonomy_account_type CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE INDEX ix_taxonomy_user_id ON taxonomy (user_id);
CREATE INDEX ix_taxonomy_account_type ON taxonomy (account_type);

-- Asset categories (31)
INSERT INTO taxonomy (id, name, account_type, is_default) VALUES
    (gen_random_uuid(), 'Land', 'asset', true),
    (gen_random_uuid(), 'Buildings', 'asset', true),
    (gen_random_uuid(), 'Machinery', 'asset', true),
    (gen_random_uuid(), 'Motor vehicles', 'asset', true),
    (gen_random_uuid(), 'Office equipment', 'asset', true),
    (gen_random_uuid(), 'Fixtures and fittings', 'asset', true),
    (gen_random_uuid(), 'Construction in progress', 'asset', true),
    (gen_random_uuid(), 'Site improvements', 'asset', true),
    (gen_random_uuid(), 'Right-of-use assets', 'asset', true),
    (gen_random_uuid(), 'Goodwill', 'asset', true),
    (gen_random_uuid(), 'Intangible assets', 'asset', true),
    (gen_random_uuid(), 'Investment property', 'asset', true),
    (gen_random_uuid(), 'Investments — equity method', 'asset', true),
    (gen_random_uuid(), 'Investments — FVTPL', 'asset', true),
    (gen_random_uuid(), 'Investments — FVOCI', 'asset', true),
    (gen_random_uuid(), 'Deferred tax assets', 'asset', true),
    (gen_random_uuid(), 'Non-current loans receivable', 'asset', true),
    (gen_random_uuid(), 'Long-term deposits', 'asset', true),
    (gen_random_uuid(), 'Non-current prepayments', 'asset', true),
    (gen_random_uuid(), 'Inventories — raw materials', 'asset', true),
    (gen_random_uuid(), 'Inventories — work in progress', 'asset', true),
    (gen_random_uuid(), 'Inventories — finished goods', 'asset', true),
    (gen_random_uuid(), 'Inventories — merchandise', 'asset', true),
    (gen_random_uuid(), 'Cash and cash equivalents', 'asset', true),
    (gen_random_uuid(), 'Trade receivables', 'asset', true),
    (gen_random_uuid(), 'Contract assets', 'asset', true),
    (gen_random_uuid(), 'Prepaid expenses', 'asset', true),
    (gen_random_uuid(), 'Tax assets', 'asset', true),
    (gen_random_uuid(), 'Short-term loans receivable', 'asset', true),
    (gen_random_uuid(), 'Short-term deposits', 'asset', true),
    (gen_random_uuid(), 'Restricted cash', 'asset', true);

-- Liability categories (19)
INSERT INTO taxonomy (id, name, account_type, is_default) VALUES
    (gen_random_uuid(), 'Trade payables', 'liability', true),
    (gen_random_uuid(), 'Other payables', 'liability', true),
    (gen_random_uuid(), 'Credit card payable', 'liability', true),
    (gen_random_uuid(), 'Accrued liabilities', 'liability', true),
    (gen_random_uuid(), 'Employee benefits payable', 'liability', true),
    (gen_random_uuid(), 'Statutory withholdings payable', 'liability', true),
    (gen_random_uuid(), 'Warranty provisions', 'liability', true),
    (gen_random_uuid(), 'Legal and restructuring provisions', 'liability', true),
    (gen_random_uuid(), 'Tax liabilities', 'liability', true),
    (gen_random_uuid(), 'Short-term borrowings', 'liability', true),
    (gen_random_uuid(), 'Current lease liabilities', 'liability', true),
    (gen_random_uuid(), 'Deferred income', 'liability', true),
    (gen_random_uuid(), 'Contract liabilities', 'liability', true),
    (gen_random_uuid(), 'Dividends payable', 'liability', true),
    (gen_random_uuid(), 'Long-term borrowings', 'liability', true),
    (gen_random_uuid(), 'Non-current lease liabilities', 'liability', true),
    (gen_random_uuid(), 'Pension obligations', 'liability', true),
    (gen_random_uuid(), 'Decommissioning provisions', 'liability', true),
    (gen_random_uuid(), 'Deferred tax liabilities', 'liability', true);

-- Equity categories (7)
INSERT INTO taxonomy (id, name, account_type, is_default) VALUES
    (gen_random_uuid(), 'Issued capital', 'equity', true),
    (gen_random_uuid(), 'Share premium', 'equity', true),
    (gen_random_uuid(), 'Retained earnings', 'equity', true),
    (gen_random_uuid(), 'Treasury shares', 'equity', true),
    (gen_random_uuid(), 'Revaluation surplus', 'equity', true),
    (gen_random_uuid(), 'Translation reserve', 'equity', true),
    (gen_random_uuid(), 'Hedging reserve', 'equity', true);

-- Revenue categories (10)
INSERT INTO taxonomy (id, name, account_type, is_default) VALUES
    (gen_random_uuid(), 'Revenue from sale of goods', 'revenue', true),
    (gen_random_uuid(), 'Revenue from rendering of services', 'revenue', true),
    (gen_random_uuid(), 'Interest income', 'revenue', true),
    (gen_random_uuid(), 'Dividend income', 'revenue', true),
    (gen_random_uuid(), 'Share of profit of associates', 'revenue', true),
    (gen_random_uuid(), 'Gains (losses) on disposals', 'revenue', true),
    (gen_random_uuid(), 'Fair value gains (losses)', 'revenue', true),
    (gen_random_uuid(), 'Foreign exchange gains (losses)', 'revenue', true),
    (gen_random_uuid(), 'Rental income', 'revenue', true),
    (gen_random_uuid(), 'Government grant income', 'revenue', true);

-- Expense categories (29)
INSERT INTO taxonomy (id, name, account_type, is_default) VALUES
    (gen_random_uuid(), 'Cost of sales', 'expense', true),
    (gen_random_uuid(), 'Employee benefits expense', 'expense', true),
    (gen_random_uuid(), 'Depreciation expense', 'expense', true),
    (gen_random_uuid(), 'Amortisation expense', 'expense', true),
    (gen_random_uuid(), 'Impairment loss', 'expense', true),
    (gen_random_uuid(), 'Advertising expense', 'expense', true),
    (gen_random_uuid(), 'Professional fees expense', 'expense', true),
    (gen_random_uuid(), 'Travel expense', 'expense', true),
    (gen_random_uuid(), 'Utilities expense', 'expense', true),
    (gen_random_uuid(), 'Warranty expense', 'expense', true),
    (gen_random_uuid(), 'Repairs and maintenance expense', 'expense', true),
    (gen_random_uuid(), 'Services expense', 'expense', true),
    (gen_random_uuid(), 'Insurance expense', 'expense', true),
    (gen_random_uuid(), 'Communication expense', 'expense', true),
    (gen_random_uuid(), 'Transportation expense', 'expense', true),
    (gen_random_uuid(), 'Warehousing expense', 'expense', true),
    (gen_random_uuid(), 'Occupancy expense', 'expense', true),
    (gen_random_uuid(), 'Rent expense', 'expense', true),
    (gen_random_uuid(), 'Interest expense', 'expense', true),
    (gen_random_uuid(), 'Income tax expense', 'expense', true),
    (gen_random_uuid(), 'Property tax expense', 'expense', true),
    (gen_random_uuid(), 'Payroll tax expense', 'expense', true),
    (gen_random_uuid(), 'Research and development expense', 'expense', true),
    (gen_random_uuid(), 'Entertainment expense', 'expense', true),
    (gen_random_uuid(), 'Meeting expense', 'expense', true),
    (gen_random_uuid(), 'Donations expense', 'expense', true),
    (gen_random_uuid(), 'Royalty expense', 'expense', true),
    (gen_random_uuid(), 'Casualty loss', 'expense', true),
    (gen_random_uuid(), 'Penalties and fines', 'expense', true);

-- ── Balance trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION enforce_balanced_journal_entry()
RETURNS TRIGGER AS $$
DECLARE
  target_entry_id UUID;
  debit_total NUMERIC(19, 4);
  credit_total NUMERIC(19, 4);
  line_count INTEGER;
BEGIN
  target_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);

  SELECT
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    COUNT(*)
  INTO debit_total, credit_total, line_count
  FROM journal_lines
  WHERE journal_entry_id = target_entry_id;

  IF line_count > 0 AND debit_total <> credit_total THEN
    RAISE EXCEPTION
      'journal entry % is unbalanced: debits=% credits=%',
      target_entry_id,
      debit_total,
      credit_total;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_enforce_balanced_journal_entry
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_balanced_journal_entry();

COMMIT;
