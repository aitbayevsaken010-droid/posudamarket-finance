-- ============================================================
-- POSUDAMARKET — SEED DATA
-- Запустить ПОСЛЕ 001_init.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- МАГАЗИНЫ
-- store_group: 1 = Абылайхана/Азербаева/Толеби/Косшыгулулы/Алпамыс
--              2 = Жургенова/Женис
-- ─────────────────────────────────────────────
INSERT INTO stores (slug, name, plan, default_emp, store_group, display_order) VALUES
  ('ablaikhan',   'Абылайхана 27/3',              1200000, 2, 1, 1),
  ('azerbayev',   'Кенен Азербаева 6',              750000, 2, 1, 2),
  ('zhurgenov',   'Темирбек Жургенов 18/2',        1000000, 2, 2, 3),
  ('tolebi',      'Толе би 46',                     750000, 2, 1, 4),
  ('koshygululy', 'Шаймерден Косшыгулулы 24',       650000, 2, 1, 5),
  ('zhenis',      'Женис 7',                         750000, 2, 2, 6),
  ('alpamys',     'Алпамыс батыра 21',              750000, 2, 1, 7);

-- ─────────────────────────────────────────────
-- ПОЛЬЗОВАТЕЛИ — создавать через Supabase Auth Dashboard
-- После создания auth-пользователей вставить записи в таблицу users:
--
-- Формат email:
--   Магазин Абылайхана : shop.ablaikhan@posuda.kz  / пароль: shop01
--   Магазин Азербаева  : shop.azerbayev@posuda.kz  / пароль: shop02
--   Магазин Жургенов   : shop.zhurgenov@posuda.kz  / пароль: shop03
--   Магазин Толе би    : shop.tolebi@posuda.kz      / пароль: shop04
--   Магазин Косшыгулулы: shop.koshygululy@posuda.kz / пароль: shop05
--   Магазин Женис      : shop.zhenis@posuda.kz       / пароль: shop06
--   Магазин Алпамыс    : shop.alpamys@posuda.kz      / пароль: shop07
--   Администратор      : admin@posuda.kz              / пароль: admin1
--   Проверяющий        : reviewer@posuda.kz           / пароль: rev123
--   Инкассатор         : cashier@posuda.kz            / пароль: cash1
--
-- После создания пользователей через Dashboard,
-- вставить записи (заменить UUID на реальные из auth.users):
-- ─────────────────────────────────────────────

-- Пример (замените UUID на реальные):
-- INSERT INTO users (id, role, store_id, display_name) VALUES
--   ('UUID_SHOP_ABLAIKHAN',   'shop',     (SELECT id FROM stores WHERE slug='ablaikhan'),   'Абылайхана'),
--   ('UUID_SHOP_AZERBAYEV',   'shop',     (SELECT id FROM stores WHERE slug='azerbayev'),   'Азербаева'),
--   ('UUID_SHOP_ZHURGENOV',   'shop',     (SELECT id FROM stores WHERE slug='zhurgenov'),   'Жургенов'),
--   ('UUID_SHOP_TOLEBI',      'shop',     (SELECT id FROM stores WHERE slug='tolebi'),      'Толе би'),
--   ('UUID_SHOP_KOSHYGULULY', 'shop',     (SELECT id FROM stores WHERE slug='koshygululy'), 'Косшыгулулы'),
--   ('UUID_SHOP_ZHENIS',      'shop',     (SELECT id FROM stores WHERE slug='zhenis'),      'Женис'),
--   ('UUID_SHOP_ALPAMYS',     'shop',     (SELECT id FROM stores WHERE slug='alpamys'),     'Алпамыс'),
--   ('UUID_ADMIN',            'admin',    NULL,                                              'Администратор'),
--   ('UUID_REVIEWER',         'reviewer', NULL,                                              'Проверяющий'),
--   ('UUID_CASHIER',          'cashier',  NULL,                                              'Инкассатор');
