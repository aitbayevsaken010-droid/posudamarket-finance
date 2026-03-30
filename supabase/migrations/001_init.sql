-- ============================================================
-- POSUDAMARKET FINANCE — DB SCHEMA v1
-- Supabase Postgres
-- Запустить в Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- STORES
-- ─────────────────────────────────────────────
CREATE TABLE stores (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug          TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  plan          INTEGER NOT NULL DEFAULT 750000,
  default_emp   INTEGER NOT NULL DEFAULT 2,
  store_group   INTEGER NOT NULL DEFAULT 1 CHECK (store_group IN (1, 2)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS (extends Supabase auth.users)
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('shop', 'admin', 'reviewer', 'cashier')),
  store_id     UUID REFERENCES stores(id),
  display_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- REPORT STATUSES (enum)
-- ─────────────────────────────────────────────
CREATE TYPE report_status AS ENUM (
  'draft_shop',
  'sent_shop',
  'draft_admin',
  'sent_admin',
  'approved',
  'rejected',
  'returned',
  'closed'
);

-- ─────────────────────────────────────────────
-- DAILY REPORTS
-- ─────────────────────────────────────────────
CREATE TABLE daily_reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id      UUID NOT NULL REFERENCES stores(id),
  date          DATE NOT NULL,
  status        report_status NOT NULL DEFAULT 'draft_shop',

  -- Shop report fields
  emp           INTEGER NOT NULL DEFAULT 2,
  start_cash    NUMERIC(14,2) NOT NULL DEFAULT 0,
  end_cash      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_return   NUMERIC(14,2) NOT NULL DEFAULT 0,
  kaspi_change  NUMERIC(14,2) NOT NULL DEFAULT 0,
  kaspi         NUMERIC(14,2) NOT NULL DEFAULT 0,
  kaspi_return  NUMERIC(14,2) NOT NULL DEFAULT 0,
  halyk         NUMERIC(14,2) NOT NULL DEFAULT 0,
  halyk_return  NUMERIC(14,2) NOT NULL DEFAULT 0,
  shop_comment  TEXT,

  -- Computed shop values (stored for history & reports)
  cash_rev          NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_kaspi         NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_halyk         NUMERIC(14,2) NOT NULL DEFAULT 0,
  kpi_sales         NUMERIC(14,2) NOT NULL DEFAULT 0,
  pct               INTEGER NOT NULL DEFAULT 0,
  bonus_per         NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  expenses_total    NUMERIC(14,2) NOT NULL DEFAULT 0,
  certs_total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  incassated_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
  effective_end_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  submitted_at      TIMESTAMPTZ,

  -- Admin / Paloma fields
  paloma_cash         NUMERIC(14,2) DEFAULT 0,
  paloma_cash_return  NUMERIC(14,2) DEFAULT 0,
  paloma_kaspi        NUMERIC(14,2) DEFAULT 0,
  paloma_kaspi_return NUMERIC(14,2) DEFAULT 0,
  paloma_halyk        NUMERIC(14,2) DEFAULT 0,
  paloma_halyk_return NUMERIC(14,2) DEFAULT 0,
  paloma_net_cash     NUMERIC(14,2) DEFAULT 0,
  paloma_net_kaspi    NUMERIC(14,2) DEFAULT 0,
  paloma_net_halyk    NUMERIC(14,2) DEFAULT 0,
  paloma_total        NUMERIC(14,2) DEFAULT 0,
  admin_comment       TEXT,
  admin_submitted_at  TIMESTAMPTZ,

  -- Reviewer fields
  reviewer_note       TEXT,
  reviewer_action_at  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, date)
);

-- ─────────────────────────────────────────────
-- EXPENSES (line items per report)
-- ─────────────────────────────────────────────
CREATE TABLE report_expenses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id  UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- GIFT CERTIFICATES
-- Группы:
--   Группа 1: Абылайхана, Азербаева, Толе би, Косшыгулулы, Алпамыс
--   Группа 2: Жургенова, Женис
--
-- debt_type:
--   debt_saken — продан в Группе 1, использован в Группе 2
--   debt_aliya — продан в Группе 2, использован в Группе 1
--   no_debt    — та же группа или неизвестно
-- ─────────────────────────────────────────────
CREATE TYPE cert_debt_type AS ENUM ('debt_saken', 'debt_aliya', 'no_debt');

CREATE TABLE gift_certificates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id        UUID NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id),  -- где использован
  date             DATE NOT NULL,
  sold_store_text  TEXT,          -- сырой текст поля "откуда"
  sold_store_group INTEGER CHECK (sold_store_group IN (1, 2)),
  used_store_group INTEGER NOT NULL CHECK (used_store_group IN (1, 2)),
  amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  comment          TEXT,
  debt_type        cert_debt_type NOT NULL DEFAULT 'no_debt',
  is_paid          BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- CASH COLLECTIONS (Инкассация)
-- ─────────────────────────────────────────────
CREATE TABLE cash_collections (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id       UUID NOT NULL REFERENCES stores(id),
  date           DATE NOT NULL,
  amount         NUMERIC(14,2) NOT NULL,
  collected_by   TEXT,
  collected_time TIME,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id),
  report_date DATE NOT NULL,
  role        TEXT NOT NULL,
  action      TEXT NOT NULL,
  detail      TEXT,
  user_id     UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────
CREATE INDEX idx_daily_reports_store_date   ON daily_reports(store_id, date);
CREATE INDEX idx_daily_reports_date         ON daily_reports(date);
CREATE INDEX idx_daily_reports_status       ON daily_reports(status);
CREATE INDEX idx_cash_collections_store_date ON cash_collections(store_id, date);
CREATE INDEX idx_gift_certs_store_date      ON gift_certificates(store_id, date);
CREATE INDEX idx_gift_certs_debt            ON gift_certificates(debt_type, is_paid);
CREATE INDEX idx_audit_logs_store_date      ON audit_logs(store_id, report_date);
CREATE INDEX idx_audit_logs_created         ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────
-- TRIGGER: обновление updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- TRIGGER: пересчёт incassated_total и effective_end_cash
-- при добавлении/удалении инкассации
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_incassated_total()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id UUID;
  v_date     DATE;
  v_total    NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_store_id := OLD.store_id;
    v_date     := OLD.date;
  ELSE
    v_store_id := NEW.store_id;
    v_date     := NEW.date;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM cash_collections
  WHERE store_id = v_store_id AND date = v_date;

  UPDATE daily_reports
  SET
    incassated_total  = v_total,
    effective_end_cash = GREATEST(0, end_cash - v_total - kaspi_change),
    updated_at        = NOW()
  WHERE store_id = v_store_id AND date = v_date;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_collections_sync
  AFTER INSERT OR UPDATE OR DELETE ON cash_collections
  FOR EACH ROW EXECUTE FUNCTION sync_incassated_total();

-- ─────────────────────────────────────────────
-- RLS — Row Level Security
-- ─────────────────────────────────────────────
ALTER TABLE stores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_expenses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;

-- Хелперы (SECURITY DEFINER чтобы не было рекурсии)
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM users WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- STORES: все читают
CREATE POLICY "stores_select" ON stores FOR SELECT TO authenticated USING (TRUE);

-- USERS: читает себя; admin/reviewer/cashier читают всех
CREATE POLICY "users_select" ON users FOR SELECT TO authenticated
  USING (id = auth.uid() OR get_my_role() IN ('admin', 'reviewer', 'cashier'));

CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- DAILY REPORTS
CREATE POLICY "reports_select" ON daily_reports FOR SELECT TO authenticated USING (
  get_my_role() IN ('admin', 'reviewer', 'cashier') OR
  (get_my_role() = 'shop' AND store_id = get_my_store_id())
);

CREATE POLICY "reports_insert" ON daily_reports FOR INSERT TO authenticated WITH CHECK (
  get_my_role() IN ('shop', 'admin', 'reviewer') OR
  (get_my_role() = 'shop' AND store_id = get_my_store_id())
);

CREATE POLICY "reports_update" ON daily_reports FOR UPDATE TO authenticated USING (
  get_my_role() IN ('admin', 'reviewer') OR
  (get_my_role() = 'shop' AND store_id = get_my_store_id())
);

-- EXPENSES
CREATE POLICY "expenses_select" ON report_expenses FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "expenses_all"    ON report_expenses FOR ALL    TO authenticated USING (
  get_my_role() IN ('shop', 'admin', 'reviewer')
);

-- GIFT CERTIFICATES
CREATE POLICY "certs_select" ON gift_certificates FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "certs_all"    ON gift_certificates FOR ALL    TO authenticated USING (
  get_my_role() IN ('shop', 'admin', 'reviewer')
);

-- CASH COLLECTIONS
CREATE POLICY "collections_select" ON cash_collections FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "collections_all"    ON cash_collections FOR ALL    TO authenticated USING (
  get_my_role() IN ('cashier', 'admin', 'reviewer')
);

-- AUDIT LOGS
CREATE POLICY "audit_select" ON audit_logs FOR SELECT TO authenticated USING (
  get_my_role() IN ('admin', 'reviewer') OR
  (get_my_role() = 'shop' AND store_id = get_my_store_id())
);
CREATE POLICY "audit_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (TRUE);
