-- ============================================================
-- RestaurantOS — Supabase Schema v2
-- Supabase SQL Editor'de çalıştır
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

create type plan_type    as enum ('starter', 'pro', 'chain');
create type order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled');

-- ============================================================
-- RESTAURANTS
-- ============================================================

create table restaurants (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid references auth.users(id) on delete cascade,
  name                   text not null,
  slug                   text unique not null,
  phone                  text,
  address                text,
  website                text,
  description            text,
  working_hours          text,
  instagram              text,
  logo_url               text,
  theme                  text not null default 'classic',
  language               text not null default 'tr',
  plan                   plan_type not null default 'starter',
  plan_expires_at        timestamptz,
  iyzico_subscription_id text,
  is_published           boolean not null default false,
  published_at           timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

create index restaurants_user_idx on restaurants(user_id);
create index restaurants_slug_idx on restaurants(slug);

-- ============================================================
-- OTP SESSIONS
-- ============================================================

create table otp_sessions (
  id          uuid primary key default uuid_generate_v4(),
  phone       text not null,
  code        text not null,
  verified    boolean default false,
  attempts    int default 0,
  expires_at  timestamptz not null default (now() + interval '10 minutes'),
  created_at  timestamptz default now()
);

create index otp_sessions_phone_idx   on otp_sessions(phone);
create index otp_sessions_expires_idx on otp_sessions(expires_at);

-- ============================================================
-- MENU SESSIONS (geçici OCR oturumu)
-- ============================================================

create table menu_sessions (
  id              uuid primary key default uuid_generate_v4(),
  session_token   text unique not null,
  restaurant_id   uuid references restaurants(id) on delete set null,
  raw_ocr_result  jsonb,
  step            int default 1,
  expires_at      timestamptz default (now() + interval '24 hours'),
  created_at      timestamptz default now()
);

-- ============================================================
-- ALLERGENS (sabit 14 alerjen)
-- ============================================================

create table allergens (
  id         uuid primary key default uuid_generate_v4(),
  name_tr    text not null,
  name_en    text not null,
  icon_slug  text not null unique,
  sort_order int default 0
);

alter table allergens enable row level security;
create policy "Herkes alerjenleri görür" on allergens for select using (true);

-- ============================================================
-- MENU ITEMS
-- ============================================================

create table menu_items (
  id                      uuid primary key default uuid_generate_v4(),
  restaurant_id           uuid not null references restaurants(id) on delete cascade,
  category                text not null default 'Genel',
  name                    text not null,
  name_en                 text,
  description             text,
  description_en          text,
  price                   numeric(10,2),
  photo_url               text,
  sort_order              int default 0,
  is_active               boolean not null default true,
  compliance_approved     boolean not null default false,
  compliance_approved_at  timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

create index menu_items_restaurant_idx on menu_items(restaurant_id);
create index menu_items_active_idx     on menu_items(restaurant_id, is_active);

-- ============================================================
-- ITEM ALLERGENS
-- ============================================================

create table item_allergens (
  menu_item_id  uuid not null references menu_items(id) on delete cascade,
  allergen_id   uuid not null references allergens(id) on delete cascade,
  ai_suggested  boolean default true,
  confirmed_at  timestamptz,
  primary key (menu_item_id, allergen_id)
);

-- ============================================================
-- NUTRITION VALUES
-- ============================================================

create table nutrition_values (
  id            uuid primary key default uuid_generate_v4(),
  menu_item_id  uuid unique not null references menu_items(id) on delete cascade,
  kcal          numeric(8,1),
  protein_g     numeric(6,1),
  fat_g         numeric(6,1),
  carb_g        numeric(6,1),
  fiber_g       numeric(6,1),
  portion_desc  text,
  ai_suggested  boolean default true,
  confirmed_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- COMPLIANCE LOG (audit trail)
-- ============================================================

create table compliance_log (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  user_id        uuid references auth.users(id),
  menu_item_id   uuid references menu_items(id) on delete set null,
  action         text not null,
  items_count    int,
  approved_count int,
  notes          text,
  confirmed_phone text,
  ip_address     text,
  user_agent     text,
  metadata       jsonb,
  created_at     timestamptz default now()
);

create index compliance_log_restaurant_idx on compliance_log(restaurant_id);

-- ============================================================
-- ORDERS
-- ============================================================

create table orders (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  table_no       text,
  status         order_status not null default 'pending',
  total_amount   numeric(10,2) not null default 0,
  note           text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index orders_restaurant_idx on orders(restaurant_id, created_at desc);

create table order_items (
  id            uuid primary key default uuid_generate_v4(),
  order_id      uuid not null references orders(id) on delete cascade,
  menu_item_id  uuid not null references menu_items(id),
  quantity      int not null default 1,
  unit_price    numeric(10,2) not null,
  total_price   numeric(10,2) not null,
  notes         text,
  created_at    timestamptz default now()
);

-- ============================================================
-- ANALYTICS EVENTS
-- ============================================================

create table analytics_events (
  id             uuid primary key default uuid_generate_v4(),
  restaurant_id  uuid not null references restaurants(id) on delete cascade,
  item_id        uuid references menu_items(id) on delete set null,
  event_type     text not null,
  ip_address     text,
  user_agent     text,
  session_id     text,
  metadata       jsonb,
  created_at     timestamptz default now()
);

create index analytics_events_restaurant_idx on analytics_events(restaurant_id, created_at desc);
create index analytics_events_type_idx       on analytics_events(restaurant_id, event_type, created_at desc);

-- ============================================================
-- RLS POLİTİKALARI
-- ============================================================

alter table restaurants      enable row level security;
alter table menu_sessions    enable row level security;
alter table menu_items       enable row level security;
alter table item_allergens   enable row level security;
alter table nutrition_values enable row level security;
alter table compliance_log   enable row level security;
alter table orders           enable row level security;
alter table order_items      enable row level security;
alter table analytics_events enable row level security;

-- RESTAURANTS
create policy "restaurants_select_own"
  on restaurants for select using (auth.uid() = user_id);
create policy "restaurants_insert_own"
  on restaurants for insert with check (auth.uid() = user_id);
create policy "restaurants_update_own"
  on restaurants for update using (auth.uid() = user_id);

-- MENU ITEMS — sahip görür/yönetir
create policy "menu_items_select_own"
  on menu_items for select
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));
create policy "menu_items_insert_own"
  on menu_items for insert
  with check (restaurant_id in (select id from restaurants where user_id = auth.uid()));
create policy "menu_items_update_own"
  on menu_items for update
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));
create policy "menu_items_delete_own"
  on menu_items for delete
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));

-- Public QR menü — aktif ürünler herkese açık
create policy "menu_items_public_read"
  on menu_items for select using (is_active = true);

-- ITEM ALLERGENS
create policy "item_allergens_own"
  on item_allergens for all
  using (
    menu_item_id in (
      select mi.id from menu_items mi
      join restaurants r on r.id = mi.restaurant_id
      where r.user_id = auth.uid()
    )
  );

-- Public allergen read (QR menü için)
create policy "item_allergens_public_read"
  on item_allergens for select using (true);

-- NUTRITION VALUES
create policy "nutrition_values_own"
  on nutrition_values for all
  using (
    menu_item_id in (
      select mi.id from menu_items mi
      join restaurants r on r.id = mi.restaurant_id
      where r.user_id = auth.uid()
    )
  );

create policy "nutrition_values_public_read"
  on nutrition_values for select using (true);

-- COMPLIANCE LOG
create policy "compliance_log_select_own"
  on compliance_log for select
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));

-- ORDERS — sahip yönetir
create policy "orders_select_own"
  on orders for select
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));

-- Anonim müşteri sipariş oluşturabilir
create policy "orders_insert_anon"
  on orders for insert with check (true);

-- ORDER ITEMS
create policy "order_items_select_own"
  on order_items for select
  using (
    order_id in (
      select o.id from orders o
      join restaurants r on r.id = o.restaurant_id
      where r.user_id = auth.uid()
    )
  );
create policy "order_items_insert_anon"
  on order_items for insert with check (true);

-- ANALYTICS EVENTS — service role ile yazılır, sahip okur
create policy "analytics_select_own"
  on analytics_events for select
  using (restaurant_id in (select id from restaurants where user_id = auth.uid()));

create policy "analytics_insert_anon"
  on analytics_events for insert with check (true);

-- MENU SESSIONS
create policy "menu_sessions_all" on menu_sessions for all using (true) with check (true);

-- ============================================================
-- SEED DATA — 14 Zorunlu Alerjen (EU/TR)
-- ============================================================

insert into allergens (name_tr, name_en, icon_slug, sort_order) values
  ('Gluten',                 'Gluten',           'gluten',     1),
  ('Kabuklu Deniz Ürünleri', 'Crustaceans',      'crustacean', 2),
  ('Yumurta',                'Eggs',             'egg',        3),
  ('Balık',                  'Fish',             'fish',       4),
  ('Yer Fıstığı',            'Peanuts',          'peanut',     5),
  ('Soya',                   'Soybeans',         'soy',        6),
  ('Süt',                    'Milk',             'milk',       7),
  ('Sert Kabuklu Yemişler',  'Nuts',             'nuts',       8),
  ('Kereviz',                'Celery',           'celery',     9),
  ('Hardal',                 'Mustard',          'mustard',   10),
  ('Susam',                  'Sesame',           'sesame',    11),
  ('Kükürt Dioksit/Sülfit',  'Sulphur Dioxide',  'sulphite',  12),
  ('Lupin',                  'Lupin',            'lupin',     13),
  ('Yumuşakçalar',           'Molluscs',         'mollusc',   14);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger restaurants_updated_at
  