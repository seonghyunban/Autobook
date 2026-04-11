-- =============================================================================
-- FULL SCHEMA — auto-run by Postgres on first init (empty volume)
-- =============================================================================
--
-- 19-table schema for the entity-scoped accounting pipeline with
-- append-only ledger (posted_entries + posted_entry_lines) and a
-- separate mutable pre-ledger layer (drafted_entries + drafted_entry_lines)
-- owned by traces. Modification = reverse + re-post; no in-place updates
-- to the ledger.
--
-- Notes:
--   - UUID primary keys use `DEFAULT uuidv7()` — Postgres 18+ native
--     function that produces temporal-ordered UUIDs (better B-tree
--     locality than random uuid4). SA models don't set a client-side
--     default; the DB generates the ID on INSERT.
--   - RLS policies are DEFINED here but NOT enabled. The
--     `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements are deferred
--     until the follow-up PR that wires session-level
--     `app.current_entity_id` into the FastAPI dependency.
--   - See operation/v4/DB refactor.md for the full design context.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- IDENTITY & TENANCY
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    email VARCHAR(320) NOT NULL UNIQUE,
    cognito_sub VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_authenticated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_users_email ON users (email);
CREATE INDEX ix_users_cognito_sub ON users (cognito_sub);

CREATE TABLE entities (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(255) NOT NULL,
    jurisdiction VARCHAR(50) NOT NULL,
    fiscal_year_end DATE NOT NULL,
    incorporation_date DATE,
    hst_registration_number VARCHAR(50),
    business_number VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE entity_memberships (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, entity_id),
    CONSTRAINT ck_entity_memberships_role CHECK (role IN ('owner', 'admin', 'member', 'viewer'))
);

CREATE INDEX ix_entity_memberships_entity_id ON entity_memberships (entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT-SCOPED REFERENCE DATA
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE chart_of_accounts (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    auto_created BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT uq_coa_entity_code UNIQUE (entity_id, account_code),
    CONSTRAINT ck_coa_account_type CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE INDEX ix_chart_of_accounts_entity_id ON chart_of_accounts (entity_id);

-- Global IFRS taxonomy. Shared across all tenants — no entity_id.
CREATE TABLE taxonomy (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(255) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    CONSTRAINT uq_taxonomy_name_type UNIQUE (name, account_type),
    CONSTRAINT ck_taxonomy_account_type CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense'))
);

CREATE INDEX ix_taxonomy_account_type ON taxonomy (account_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE transactions (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    submitted_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    raw_text TEXT NOT NULL,
    raw_file_s3_key VARCHAR(500),
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX ix_transactions_entity_id ON transactions (entity_id);
CREATE INDEX ix_transactions_submitted_by ON transactions (submitted_by);

-- ─────────────────────────────────────────────────────────────────────────────
-- DRAFTS (one per parse session; a transaction can have many drafts)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE drafts (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    jurisdiction VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX ix_drafts_entity_id ON drafts (entity_id);
CREATE INDEX ix_drafts_transaction_id ON drafts (transaction_id);

COMMENT ON TABLE drafts IS
    'One parse session of a transaction. Re-running the agent on the same '
    'transaction creates a new draft row. Each draft owns at most one attempt '
    'and one correction trace via UNIQUE(draft_id, kind) on traces.';

-- ─────────────────────────────────────────────────────────────────────────────
-- TRANSACTION GRAPH (nodes + edges)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE transaction_graphs (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX ix_transaction_graphs_entity_id ON transaction_graphs (entity_id);
CREATE INDEX ix_transaction_graphs_transaction_id ON transaction_graphs (transaction_id);

CREATE TABLE transaction_graph_nodes (
    graph_id UUID NOT NULL REFERENCES transaction_graphs (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    node_index INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    PRIMARY KEY (graph_id, node_index),
    CONSTRAINT ck_graph_nodes_role CHECK (role IN ('reporting_entity', 'counterparty', 'indirect_party'))
);

CREATE INDEX ix_transaction_graph_nodes_entity_id ON transaction_graph_nodes (entity_id);

CREATE TABLE transaction_graph_edges (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    graph_id UUID NOT NULL REFERENCES transaction_graphs (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    source_index INTEGER NOT NULL,
    target_index INTEGER NOT NULL,
    nature VARCHAR(100) NOT NULL,
    edge_kind VARCHAR(30) NOT NULL,
    amount NUMERIC(15, 2),
    currency VARCHAR(3),
    CONSTRAINT ck_graph_edges_kind CHECK (edge_kind IN ('reciprocal_exchange', 'chained_exchange', 'non_exchange', 'relationship')),
    CONSTRAINT ck_graph_edges_currency_iso4217 CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$')
);

CREATE INDEX ix_transaction_graph_edges_graph_id ON transaction_graph_edges (graph_id);
CREATE INDEX ix_transaction_graph_edges_entity_id ON transaction_graph_edges (entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- DRAFTED ENTRIES (pre-ledger, mutable, owned by traces)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE drafted_entries (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    entry_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX ix_drafted_entries_entity_id ON drafted_entries (entity_id);

CREATE TABLE drafted_entry_lines (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    drafted_entry_id UUID NOT NULL REFERENCES drafted_entries (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    line_order INTEGER NOT NULL,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    CONSTRAINT ck_drafted_entry_lines_type CHECK (type IN ('debit', 'credit')),
    CONSTRAINT ck_drafted_entry_lines_amount_positive CHECK (amount > 0),
    CONSTRAINT ck_drafted_entry_lines_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX ix_drafted_entry_lines_drafted_entry_id ON drafted_entry_lines (drafted_entry_id);
CREATE INDEX ix_drafted_entry_lines_entity_id ON drafted_entry_lines (entity_id);

COMMENT ON COLUMN drafted_entry_lines.account_name IS
    'Intentional snapshot of chart_of_accounts.account_name at insert time. '
    'Frozen so renaming the COA later does not retroactively rewrite the '
    'user''s saved draft. DAOs MUST source this from the current COA on insert.';

-- ─────────────────────────────────────────────────────────────────────────────
-- TRACES (single-table inheritance: attempt + correction)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE traces (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    draft_id UUID NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
    graph_id UUID NOT NULL REFERENCES transaction_graphs (id) ON DELETE RESTRICT,
    drafted_entry_id UUID NOT NULL REFERENCES drafted_entries (id) ON DELETE RESTRICT,
    kind VARCHAR(10) NOT NULL,

    -- attempt-only
    origin_tier SMALLINT,
    tax_reasoning TEXT,

    -- correction-only
    corrected_by UUID REFERENCES users (id) ON DELETE RESTRICT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    note_tx_analysis TEXT,
    note_ambiguity TEXT,
    note_tax TEXT,
    note_entry TEXT,

    -- shared reasoning
    decision_kind VARCHAR(20),
    decision_rationale TEXT,
    tax_classification VARCHAR(20),
    tax_rate NUMERIC(5, 4),
    tax_context TEXT,
    tax_itc_eligible BOOLEAN,
    tax_amount_inclusive BOOLEAN,
    tax_mentioned BOOLEAN,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,

    CONSTRAINT uq_traces_draft_kind UNIQUE (draft_id, kind),
    CONSTRAINT ck_traces_kind CHECK (kind IN ('attempt', 'correction')),
    CONSTRAINT ck_traces_origin_tier CHECK (origin_tier IS NULL OR origin_tier BETWEEN 1 AND 4),
    CONSTRAINT ck_traces_decision_kind CHECK (decision_kind IS NULL OR decision_kind IN ('PROCEED', 'MISSING_INFO', 'STUCK')),
    CONSTRAINT ck_traces_tax_classification CHECK (tax_classification IS NULL OR tax_classification IN ('taxable', 'zero_rated', 'exempt', 'out_of_scope'))
);

CREATE INDEX ix_traces_entity_id ON traces (entity_id);
CREATE INDEX ix_traces_draft_id ON traces (draft_id);
CREATE INDEX ix_traces_graph_id ON traces (graph_id);
CREATE INDEX ix_traces_drafted_entry_id ON traces (drafted_entry_id);
CREATE INDEX ix_traces_corrected_by ON traces (corrected_by);

COMMENT ON TABLE traces IS
    'Physically unified attempt + correction. SQLAlchemy single-table '
    'inheritance gives two ORM classes (AttemptedTrace, CorrectedTrace) '
    'driven by the kind discriminator. Traces live in the pre-ledger '
    'layer — editing them after the user has posted is fine because the '
    'ledger is a separate, snapshotted structure that does not reference '
    'drafted_entries in any way.';

CREATE TABLE trace_classifications (
    drafted_entry_line_id UUID NOT NULL PRIMARY KEY REFERENCES drafted_entry_lines (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    taxonomy VARCHAR(255) NOT NULL
);

CREATE INDEX ix_trace_classifications_entity_id ON trace_classifications (entity_id);

CREATE TABLE trace_ambiguities (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    trace_id UUID NOT NULL REFERENCES traces (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    aspect VARCHAR(255) NOT NULL,
    ambiguous BOOLEAN NOT NULL,
    conventional_default TEXT,
    ifrs_default TEXT,
    clarification_question TEXT
);

CREATE INDEX ix_trace_ambiguities_trace_id ON trace_ambiguities (trace_id);
CREATE INDEX ix_trace_ambiguities_entity_id ON trace_ambiguities (entity_id);

CREATE TABLE trace_ambiguity_cases (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    ambiguity_id UUID NOT NULL REFERENCES trace_ambiguities (id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    case_text TEXT NOT NULL,
    proposed_entry_json JSONB
);

CREATE INDEX ix_trace_ambiguity_cases_ambiguity_id ON trace_ambiguity_cases (ambiguity_id);
CREATE INDEX ix_trace_ambiguity_cases_entity_id ON trace_ambiguity_cases (entity_id);

COMMENT ON COLUMN trace_ambiguity_cases.proposed_entry_json IS
    'Optional structured proposal sketching the journal entry under this '
    'ambiguity case interpretation. Stored as JSONB because it is '
    'variable-shape, read-whole (never queried field-by-field), never '
    'mutated after creation, never posted to the ledger, and only used '
    'for display in the review panel. This is the only deliberate JSONB '
    'use in the pre-ledger layer.';

-- ─────────────────────────────────────────────────────────────────────────────
-- POSTED LEDGER (append-only — no UPDATE, no DELETE)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every row is either an ORIGINAL posting (reverses IS NULL) or a REVERSAL
-- of another posting (reverses = the cancelled row's id). A transaction can
-- have many rows over time — original plus any number of correction cycles
-- (reverse + re-post). Current state is always derived by summing lines.

CREATE TABLE posted_entries (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE RESTRICT,
    transaction_id UUID NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
    reverses UUID REFERENCES posted_entries (id) ON DELETE RESTRICT,
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    posted_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT
);

CREATE INDEX ix_posted_entries_entity_id ON posted_entries (entity_id);
CREATE INDEX ix_posted_entries_transaction_id ON posted_entries (transaction_id);
CREATE INDEX ix_posted_entries_reverses ON posted_entries (reverses);
CREATE INDEX ix_posted_entries_posted_by ON posted_entries (posted_by);

-- At most one reversal per original row. (DB-enforced invariant.)
CREATE UNIQUE INDEX uq_posted_entries_one_reversal_per_original
    ON posted_entries (reverses)
    WHERE reverses IS NOT NULL;

COMMENT ON TABLE posted_entries IS
    'Append-only ledger header. Every row is either an ORIGINAL posting '
    '(reverses IS NULL) or a REVERSAL of another posting (reverses = the '
    'cancelled row). A transaction can have many rows over time — original '
    'plus any number of correction cycles (reverse + re-post). Current '
    'state is always derived by summing lines, never stored.';

COMMENT ON COLUMN posted_entries.reverses IS
    'NULL for originals; set to the id of the posted_entries row this one '
    'cancels. Enforced: at most one reversal per original (partial unique '
    'index). Reverse-of-reverse is blocked at the service layer, not the DB.';

CREATE TABLE posted_entry_lines (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    posted_entry_id UUID NOT NULL REFERENCES posted_entries (id) ON DELETE RESTRICT,
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE RESTRICT,
    line_order INTEGER NOT NULL,
    account_code VARCHAR(20) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    type VARCHAR(10) NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    CONSTRAINT ck_posted_entry_lines_type CHECK (type IN ('debit', 'credit')),
    CONSTRAINT ck_posted_entry_lines_amount_positive CHECK (amount > 0),
    CONSTRAINT ck_posted_entry_lines_currency_iso4217 CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX ix_posted_entry_lines_posted_entry_id ON posted_entry_lines (posted_entry_id);
CREATE INDEX ix_posted_entry_lines_entity_id ON posted_entry_lines (entity_id);

COMMENT ON COLUMN posted_entry_lines.account_name IS
    'Immutable snapshot of chart_of_accounts.account_name at posting time. '
    'Frozen so renaming the COA later does not rewrite ledger history.';

-- ─────────────────────────────────────────────────────────────────────────────
-- PRECEDENT MATCHER (Tier 2 of the 4-tier cascade)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE precedent_entries (
    id UUID NOT NULL PRIMARY KEY DEFAULT uuidv7(),
    entity_id UUID NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    vendor TEXT NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    structure_hash VARCHAR(64) NOT NULL,
    structure JSONB NOT NULL,
    ratio JSONB NOT NULL,
    source_posted_entry_id UUID REFERENCES posted_entries (id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX ix_precedent_entries_entity_id ON precedent_entries (entity_id);
CREATE INDEX ix_precedent_entries_entity_vendor_created
    ON precedent_entries (entity_id, vendor, created_at);
CREATE INDEX ix_precedent_entries_source_posted_entry_id
    ON precedent_entries (source_posted_entry_id);

COMMENT ON TABLE precedent_entries IS
    'Precedent matcher (Tier 2 of the 4-tier cascade). Stores human-confirmed '
    'structural fingerprints of past entries. JSONB on (structure, ratio) is '
    'deliberate — these are variable-shape bags the matcher reads as a whole.';

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at TRIGGER — auto-bump on UPDATE for mutable tables
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: posted_entries and posted_entry_lines do NOT get an updated_at
-- trigger — they are append-only and never receive UPDATE statements.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entities_updated_at
    BEFORE UPDATE ON entities
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_chart_of_accounts_updated_at
    BEFORE UPDATE ON chart_of_accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transaction_graphs_updated_at
    BEFORE UPDATE ON transaction_graphs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_drafted_entries_updated_at
    BEFORE UPDATE ON drafted_entries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_traces_updated_at
    BEFORE UPDATE ON traces
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- BALANCE TRIGGERS — enforce debits = credits per entry
-- ─────────────────────────────────────────────────────────────────────────────
-- These are backstops. The posting service validates balance BEFORE calling
-- the DAO — the triggers catch bugs that bypass the service layer.

CREATE OR REPLACE FUNCTION enforce_balanced_drafted_entry()
RETURNS TRIGGER AS $$
DECLARE
    target_id UUID;
    debit_total NUMERIC(19, 4);
    credit_total NUMERIC(19, 4);
    line_count INTEGER;
BEGIN
    target_id := COALESCE(NEW.drafted_entry_id, OLD.drafted_entry_id);

    SELECT
        COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
        COUNT(*)
    INTO debit_total, credit_total, line_count
    FROM drafted_entry_lines
    WHERE drafted_entry_id = target_id;

    IF line_count > 0 AND debit_total <> credit_total THEN
        RAISE EXCEPTION
            'drafted entry % is unbalanced: debits=% credits=%',
            target_id, debit_total, credit_total;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_enforce_balanced_drafted_entry
    AFTER INSERT OR UPDATE OR DELETE ON drafted_entry_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION enforce_balanced_drafted_entry();


CREATE OR REPLACE FUNCTION enforce_balanced_posted_entry()
RETURNS TRIGGER AS $$
DECLARE
    target_id UUID;
    debit_total NUMERIC(19, 4);
    credit_total NUMERIC(19, 4);
    line_count INTEGER;
BEGIN
    target_id := COALESCE(NEW.posted_entry_id, OLD.posted_entry_id);

    SELECT
        COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
        COUNT(*)
    INTO debit_total, credit_total, line_count
    FROM posted_entry_lines
    WHERE posted_entry_id = target_id;

    IF line_count > 0 AND debit_total <> credit_total THEN
        RAISE EXCEPTION
            'posted entry % is unbalanced: debits=% credits=%',
            target_id, debit_total, credit_total;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_enforce_balanced_posted_entry
    AFTER INSERT OR UPDATE OR DELETE ON posted_entry_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION enforce_balanced_posted_entry();

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY — policies DEFINED, NOT enabled in this PR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements are
-- intentionally omitted. Policies are declared below so the follow-up PR
-- that wires session-level `app.current_entity_id` into the FastAPI
-- dependency only needs to run ENABLE ROW LEVEL SECURITY on each table.
--
-- Every policy uses the same template:
--   USING (entity_id = current_setting('app.current_entity_id')::uuid)

CREATE POLICY tenant_isolation ON chart_of_accounts
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON transactions
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON drafts
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON transaction_graphs
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON transaction_graph_nodes
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON transaction_graph_edges
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON drafted_entries
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON drafted_entry_lines
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON traces
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON trace_classifications
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON trace_ambiguities
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON trace_ambiguity_cases
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON posted_entries
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON posted_entry_lines
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

CREATE POLICY tenant_isolation ON precedent_entries
    USING (entity_id = current_setting('app.current_entity_id')::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- TAXONOMY SEED DATA (global IFRS categories)
-- ─────────────────────────────────────────────────────────────────────────────

-- Asset categories (31)
INSERT INTO taxonomy (id, name, account_type) VALUES
    (gen_random_uuid(), 'Land', 'asset'),
    (gen_random_uuid(), 'Buildings', 'asset'),
    (gen_random_uuid(), 'Machinery', 'asset'),
    (gen_random_uuid(), 'Motor vehicles', 'asset'),
    (gen_random_uuid(), 'Office equipment', 'asset'),
    (gen_random_uuid(), 'Fixtures and fittings', 'asset'),
    (gen_random_uuid(), 'Construction in progress', 'asset'),
    (gen_random_uuid(), 'Site improvements', 'asset'),
    (gen_random_uuid(), 'Right-of-use assets', 'asset'),
    (gen_random_uuid(), 'Goodwill', 'asset'),
    (gen_random_uuid(), 'Intangible assets', 'asset'),
    (gen_random_uuid(), 'Investment property', 'asset'),
    (gen_random_uuid(), 'Investments — equity method', 'asset'),
    (gen_random_uuid(), 'Investments — FVTPL', 'asset'),
    (gen_random_uuid(), 'Investments — FVOCI', 'asset'),
    (gen_random_uuid(), 'Deferred tax assets', 'asset'),
    (gen_random_uuid(), 'Non-current loans receivable', 'asset'),
    (gen_random_uuid(), 'Long-term deposits', 'asset'),
    (gen_random_uuid(), 'Non-current prepayments', 'asset'),
    (gen_random_uuid(), 'Inventories — raw materials', 'asset'),
    (gen_random_uuid(), 'Inventories — work in progress', 'asset'),
    (gen_random_uuid(), 'Inventories — finished goods', 'asset'),
    (gen_random_uuid(), 'Inventories — merchandise', 'asset'),
    (gen_random_uuid(), 'Cash and cash equivalents', 'asset'),
    (gen_random_uuid(), 'Trade receivables', 'asset'),
    (gen_random_uuid(), 'Contract assets', 'asset'),
    (gen_random_uuid(), 'Prepaid expenses', 'asset'),
    (gen_random_uuid(), 'Tax assets', 'asset'),
    (gen_random_uuid(), 'Short-term loans receivable', 'asset'),
    (gen_random_uuid(), 'Short-term deposits', 'asset'),
    (gen_random_uuid(), 'Restricted cash', 'asset');

-- Liability categories (19)
INSERT INTO taxonomy (id, name, account_type) VALUES
    (gen_random_uuid(), 'Trade payables', 'liability'),
    (gen_random_uuid(), 'Other payables', 'liability'),
    (gen_random_uuid(), 'Credit card payable', 'liability'),
    (gen_random_uuid(), 'Accrued liabilities', 'liability'),
    (gen_random_uuid(), 'Employee benefits payable', 'liability'),
    (gen_random_uuid(), 'Statutory withholdings payable', 'liability'),
    (gen_random_uuid(), 'Warranty provisions', 'liability'),
    (gen_random_uuid(), 'Legal and restructuring provisions', 'liability'),
    (gen_random_uuid(), 'Tax liabilities', 'liability'),
    (gen_random_uuid(), 'Short-term borrowings', 'liability'),
    (gen_random_uuid(), 'Current lease liabilities', 'liability'),
    (gen_random_uuid(), 'Deferred income', 'liability'),
    (gen_random_uuid(), 'Contract liabilities', 'liability'),
    (gen_random_uuid(), 'Dividends payable', 'liability'),
    (gen_random_uuid(), 'Long-term borrowings', 'liability'),
    (gen_random_uuid(), 'Non-current lease liabilities', 'liability'),
    (gen_random_uuid(), 'Pension obligations', 'liability'),
    (gen_random_uuid(), 'Decommissioning provisions', 'liability'),
    (gen_random_uuid(), 'Deferred tax liabilities', 'liability');

-- Equity categories (7)
INSERT INTO taxonomy (id, name, account_type) VALUES
    (gen_random_uuid(), 'Issued capital', 'equity'),
    (gen_random_uuid(), 'Share premium', 'equity'),
    (gen_random_uuid(), 'Retained earnings', 'equity'),
    (gen_random_uuid(), 'Treasury shares', 'equity'),
    (gen_random_uuid(), 'Revaluation surplus', 'equity'),
    (gen_random_uuid(), 'Translation reserve', 'equity'),
    (gen_random_uuid(), 'Hedging reserve', 'equity');

-- Revenue categories (10)
INSERT INTO taxonomy (id, name, account_type) VALUES
    (gen_random_uuid(), 'Revenue from sale of goods', 'revenue'),
    (gen_random_uuid(), 'Revenue from rendering of services', 'revenue'),
    (gen_random_uuid(), 'Interest income', 'revenue'),
    (gen_random_uuid(), 'Dividend income', 'revenue'),
    (gen_random_uuid(), 'Share of profit of associates', 'revenue'),
    (gen_random_uuid(), 'Gains (losses) on disposals', 'revenue'),
    (gen_random_uuid(), 'Fair value gains (losses)', 'revenue'),
    (gen_random_uuid(), 'Foreign exchange gains (losses)', 'revenue'),
    (gen_random_uuid(), 'Rental income', 'revenue'),
    (gen_random_uuid(), 'Government grant income', 'revenue');

-- Expense categories (29)
INSERT INTO taxonomy (id, name, account_type) VALUES
    (gen_random_uuid(), 'Cost of sales', 'expense'),
    (gen_random_uuid(), 'Employee benefits expense', 'expense'),
    (gen_random_uuid(), 'Depreciation expense', 'expense'),
    (gen_random_uuid(), 'Amortisation expense', 'expense'),
    (gen_random_uuid(), 'Impairment loss', 'expense'),
    (gen_random_uuid(), 'Advertising expense', 'expense'),
    (gen_random_uuid(), 'Professional fees expense', 'expense'),
    (gen_random_uuid(), 'Travel expense', 'expense'),
    (gen_random_uuid(), 'Utilities expense', 'expense'),
    (gen_random_uuid(), 'Warranty expense', 'expense'),
    (gen_random_uuid(), 'Repairs and maintenance expense', 'expense'),
    (gen_random_uuid(), 'Services expense', 'expense'),
    (gen_random_uuid(), 'Insurance expense', 'expense'),
    (gen_random_uuid(), 'Communication expense', 'expense'),
    (gen_random_uuid(), 'Transportation expense', 'expense'),
    (gen_random_uuid(), 'Warehousing expense', 'expense'),
    (gen_random_uuid(), 'Occupancy expense', 'expense'),
    (gen_random_uuid(), 'Rent expense', 'expense'),
    (gen_random_uuid(), 'Interest expense', 'expense'),
    (gen_random_uuid(), 'Income tax expense', 'expense'),
    (gen_random_uuid(), 'Property tax expense', 'expense'),
    (gen_random_uuid(), 'Payroll tax expense', 'expense'),
    (gen_random_uuid(), 'Research and development expense', 'expense'),
    (gen_random_uuid(), 'Entertainment expense', 'expense'),
    (gen_random_uuid(), 'Meeting expense', 'expense'),
    (gen_random_uuid(), 'Donations expense', 'expense'),
    (gen_random_uuid(), 'Royalty expense', 'expense'),
    (gen_random_uuid(), 'Casualty loss', 'expense'),
    (gen_random_uuid(), 'Penalties and fines', 'expense');

COMMIT;
