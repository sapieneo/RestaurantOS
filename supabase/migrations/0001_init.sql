-- ============================================================================
-- RestaurantOS — 0001_init.sql (M0)
-- Çok kiracılı şema + RLS + alerjen seed
-- Uygulama: supabase db push  (veya CI'da boş Postgres'e psql ile)
-- ============================================================================

-- Not: gen_random_uuid() PostgreSQL 13+ çekirdeğinde mevcut; pgcrypto gerekmez.

-- ----------------------------------------------------------------------------
-- 0) Yardımcı şema
-- ----------------------------------------------------------------------------
create schema if not exists app;

-- ----------------------------------------------------------------------------
-- 1) Enum'lar
-- ----------------------------------------------------------------------------
create type public.plan_tier          as enum ('free', 'pro', 'enterprise');
create type public.member_role        as enum ('owner', 'admin', 'editor', 'viewer');
create type public.ingest_source      as enum ('image', 'pdf', 'url', 'manual');
create type public.ingest_status      as enum ('uploaded', 'processing', 'review', 'approved', 'failed');
create type public.compliance_state   as enum ('pending', 'ai_suggested', 'confirmed');
create type public.content_source     as enum ('ai', 'manual', 'verified');
create type public.scan_event_type    as enum ('scan', 'menu_view', 'item_view', 'language_switch');

-- ----------------------------------------------------------------------------
-- 2) Çekirdek kiracı tabloları
-- ----------------------------------------------------------------------------
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'İşletmem',
  plan          public.plan_tier not null default 'free',
  country_code  text not null default 'TR',          -- ISO 3166-1 alpha-2
  created_by    uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.organization_members (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.organization_members (user_id);

create table public.venues (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  slug            text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name            text not null,
  description     text,
  address         text,
  phone           text,
  whatsapp        text,
  instagram       text,
  google_maps_url text,
  wifi_ssid       text,
  logo_url        text,
  cover_url       text,
  currency_code   text not null default 'TRY',       -- ISO 4217
  default_locale  text not null default 'tr',        -- BCP 47
  timezone        text not null default 'Europe/Istanbul',
  custom_domain   text unique,                        -- M4+ için rezerve
  is_published    boolean not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index venues_org_idx on public.venues (org_id);

create table public.menus (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  name        text not null default 'Menü',
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index menus_venue_idx on public.menus (venue_id);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  menu_id     uuid not null references public.menus(id) on delete cascade,
  name        text not null,                          -- venue varsayılan dilinde
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index categories_menu_idx on public.categories (menu_id);

create table public.items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  category_id     uuid not null references public.categories(id) on delete cascade,
  name            text not null,                      -- venue varsayılan dilinde
  description     text,
  price           numeric(12,2) check (price is null or price >= 0),
  image_url       text,
  is_available    boolean not null default true,
  sort_order      int  not null default 0,
  calories_kcal   int check (calories_kcal is null or calories_kcal between 0 and 20000),
  calories_source public.content_source,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index items_category_idx on public.items (category_id);

-- ----------------------------------------------------------------------------
-- 3) Çeviriler
-- ----------------------------------------------------------------------------
create table public.category_translations (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  locale      text not null,
  name        text not null,
  source      public.content_source not null default 'ai',
  updated_at  timestamptz not null default now(),
  primary key (category_id, locale)
);

create table public.item_translations (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  item_id     uuid not null references public.items(id) on delete cascade,
  locale      text not null,
  name        text not null,
  description text,
  source      public.content_source not null default 'ai',
  updated_at  timestamptz not null default now(),
  primary key (item_id, locale)
);

-- ----------------------------------------------------------------------------
-- 4) Uyum motoru
-- ----------------------------------------------------------------------------
-- Global alerjen kataloğu (seed aşağıda). region_scope: 'EU' = 14 majör set,
-- 'TR' = Türkiye'ye özgü ek beyanlar. Yeni ülkeler yeni scope satırı ekler.
create table public.allergens (
  id           smallint primary key,
  code         text not null unique,
  name_tr      text not null,
  name_en      text not null,
  icon_slug    text not null,
  region_scope text not null default 'EU'
);

create table public.item_allergens (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  allergen_id  smallint not null references public.allergens(id),
  state        public.compliance_state not null default 'ai_suggested',
  confidence   numeric(4,3) check (confidence is null or confidence between 0 and 1),
  source       public.content_source not null default 'ai',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  primary key (item_id, allergen_id)
);

-- Ürün başına inceleme durumu. "Alerjensiz" de bir beyandır: satır yoksa
-- 'incelenmedi', allergen_review = confirmed + item_allergens boş = 'alerjensiz onaylı'.
create table public.item_compliance (
  org_id            uuid not null references public.organizations(id) on delete cascade,
  item_id           uuid primary key references public.items(id) on delete cascade,
  allergen_review   public.compliance_state not null default 'pending',
  calories_review   public.compliance_state not null default 'pending',
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  ai_notes          jsonb,                            -- ham AI önerisi/gerekçesi
  updated_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5) AI içe aktarma (durum makinesi)
-- ----------------------------------------------------------------------------
create table public.menu_ingestions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  uploaded_by   uuid not null references auth.users(id),
  source_type   public.ingest_source not null,
  storage_path  text,                                 -- menu-uploads bucket yolu
  source_url    text,                                 -- source_type = 'url' ise
  status        public.ingest_status not null default 'uploaded',
  raw_result    jsonb,                                -- doğrulanmış AI çıktısı
  input_hash    text,                                 -- idempotency (aynı dosya 2x işlenmez)
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index ingestions_venue_idx on public.menu_ingestions (venue_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 6) QR yönlendirme katmanı
-- ----------------------------------------------------------------------------
create table public.qr_codes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  code        text not null unique
                check (code ~ '^[a-z0-9]{8}$'),       -- /q/{code}
  label       text,                                   -- "Masa 4", "Vitrin" (ops.)
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index qr_codes_venue_idx on public.qr_codes (venue_id);

-- ----------------------------------------------------------------------------
-- 7) Analitik (çerezsiz; yalnız service role yazar)
-- ----------------------------------------------------------------------------
create table public.scan_events (
  id           bigint generated always as identity primary key,
  org_id       uuid not null,
  venue_id     uuid not null,
  qr_code_id   uuid,
  item_id      uuid,
  event_type   public.scan_event_type not null,
  locale       text,
  device_type  text,                                  -- mobile | desktop | tablet
  country      text,                                  -- edge geo başlığından
  session_key  text,                                  -- hash(ip+ua+günlük salt), PII yok
  occurred_at  timestamptz not null default now()
);
create index scan_events_venue_time_idx on public.scan_events (venue_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- 8) Yardımcı fonksiyonlar
-- ----------------------------------------------------------------------------
-- Üyelik denetimi. SECURITY DEFINER: RLS altındaki tablodan üyelik tablosuna bakar.
create or replace function app.is_org_member(p_org uuid, p_min public.member_role default 'viewer')
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org
      and m.user_id = auth.uid()
      and case p_min
            when 'viewer' then true
            when 'editor' then m.role in ('editor','admin','owner')
            when 'admin'  then m.role in ('admin','owner')
            when 'owner'  then m.role = 'owner'
          end
  );
$$;

-- updated_at güncelleyici
create or replace function app.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Org oluşturana otomatik owner üyeliği
create or replace function app.grant_owner_on_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.organization_members (org_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end $$;

-- org_id'yi parent'tan otomatik doldur (denormalizasyon — bkz. ADR A5)
create or replace function app.fill_org_id()
returns trigger language plpgsql as $$
begin
  if new.org_id is null then
    if tg_table_name = 'menus' then
      select v.org_id into new.org_id from public.venues v where v.id = new.venue_id;
    elsif tg_table_name = 'categories' then
      select m.org_id into new.org_id from public.menus m where m.id = new.menu_id;
    elsif tg_table_name in ('items') then
      select c.org_id into new.org_id from public.categories c where c.id = new.category_id;
    elsif tg_table_name in ('item_translations','item_allergens','item_compliance') then
      select i.org_id into new.org_id from public.items i where i.id = new.item_id;
    elsif tg_table_name = 'category_translations' then
      select c.org_id into new.org_id from public.categories c where c.id = new.category_id;
    end if;
  end if;
  return new;
end $$;

-- ----------------------------------------------------------------------------
-- 9) Trigger'lar
-- ----------------------------------------------------------------------------
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();
create trigger venues_touch before update on public.venues
  for each row execute function app.touch_updated_at();
create trigger menus_touch before update on public.menus
  for each row execute function app.touch_updated_at();
create trigger categories_touch before update on public.categories
  for each row execute function app.touch_updated_at();
create trigger items_touch before update on public.items
  for each row execute function app.touch_updated_at();
create trigger ingestions_touch before update on public.menu_ingestions
  for each row execute function app.touch_updated_at();
create trigger item_compliance_touch before update on public.item_compliance
  for each row execute function app.touch_updated_at();

create trigger organizations_owner after insert on public.organizations
  for each row execute function app.grant_owner_on_org();

create trigger menus_fill_org before insert on public.menus
  for each row execute function app.fill_org_id();
create trigger categories_fill_org before insert on public.categories
  for each row execute function app.fill_org_id();
create trigger items_fill_org before insert on public.items
  for each row execute function app.fill_org_id();
create trigger item_translations_fill_org before insert on public.item_translations
  for each row execute function app.fill_org_id();
create trigger category_translations_fill_org before insert on public.category_translations
  for each row execute function app.fill_org_id();
create trigger item_allergens_fill_org before insert on public.item_allergens
  for each row execute function app.fill_org_id();
create trigger item_compliance_fill_org before insert on public.item_compliance
  for each row execute function app.fill_org_id();

-- ----------------------------------------------------------------------------
-- 10) RLS
-- ----------------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.venues               enable row level security;
alter table public.menus                enable row level security;
alter table public.categories           enable row level security;
alter table public.items                enable row level security;
alter table public.category_translations enable row level security;
alter table public.item_translations    enable row level security;
alter table public.allergens            enable row level security;
alter table public.item_allergens       enable row level security;
alter table public.item_compliance      enable row level security;
alter table public.menu_ingestions      enable row level security;
alter table public.qr_codes             enable row level security;
alter table public.scan_events          enable row level security;

-- organizations: üye okur; authenticated (anonim dahil) kendi adına oluşturur; owner günceller/siler
create policy org_select on public.organizations for select
  using (app.is_org_member(id));
create policy org_insert on public.organizations for insert to authenticated
  with check (created_by = auth.uid());
create policy org_update on public.organizations for update
  using (app.is_org_member(id, 'owner'));
create policy org_delete on public.organizations for delete
  using (app.is_org_member(id, 'owner'));

-- organization_members: üyeler listeyi görür; yönetim M4'te (davet akışı) — şimdilik yalnız admin ekler/çıkarır
create policy members_select on public.organization_members for select
  using (app.is_org_member(org_id));
create policy members_insert on public.organization_members for insert to authenticated
  with check (app.is_org_member(org_id, 'admin'));
create policy members_delete on public.organization_members for delete
  using (app.is_org_member(org_id, 'admin') and role <> 'owner');

-- Kiracı içerik tabloları için tek tip desen:
--   SELECT: org üyesi VEYA (yayınlanmış venue zinciri → anon dahil herkes)
--   INSERT/UPDATE/DELETE: editor+
create policy venues_select on public.venues for select
  using (is_published or app.is_org_member(org_id));
create policy venues_write on public.venues for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy venues_update on public.venues for update
  using (app.is_org_member(org_id, 'editor'));
create policy venues_delete on public.venues for delete
  using (app.is_org_member(org_id, 'admin'));

create policy menus_select on public.menus for select
  using (
    app.is_org_member(org_id)
    or exists (select 1 from public.venues v where v.id = venue_id and v.is_published)
  );
create policy menus_write on public.menus for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy menus_update on public.menus for update
  using (app.is_org_member(org_id, 'editor'));
create policy menus_delete on public.menus for delete
  using (app.is_org_member(org_id, 'editor'));

create policy categories_select on public.categories for select
  using (
    app.is_org_member(org_id)
    or exists (select 1
                 from public.menus m join public.venues v on v.id = m.venue_id
                where m.id = menu_id and v.is_published and m.is_active)
  );
create policy categories_write on public.categories for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy categories_update on public.categories for update
  using (app.is_org_member(org_id, 'editor'));
create policy categories_delete on public.categories for delete
  using (app.is_org_member(org_id, 'editor'));

create policy items_select on public.items for select
  using (
    app.is_org_member(org_id)
    or exists (select 1
                 from public.categories c
                 join public.menus m on m.id = c.menu_id
                 join public.venues v on v.id = m.venue_id
                where c.id = category_id and v.is_published and m.is_active and c.is_active)
  );
create policy items_write on public.items for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy items_update on public.items for update
  using (app.is_org_member(org_id, 'editor'));
create policy items_delete on public.items for delete
  using (app.is_org_member(org_id, 'editor'));

-- Çeviri tabloları: içerikle aynı görünürlük (yayınlıysa herkes okur), yazma editor+
create policy cat_tr_select on public.category_translations for select
  using (
    app.is_org_member(org_id)
    or exists (select 1
                 from public.categories c
                 join public.menus m on m.id = c.menu_id
                 join public.venues v on v.id = m.venue_id
                where c.id = category_id and v.is_published)
  );
create policy cat_tr_write on public.category_translations for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy cat_tr_update on public.category_translations for update
  using (app.is_org_member(org_id, 'editor'));
create policy cat_tr_delete on public.category_translations for delete
  using (app.is_org_member(org_id, 'editor'));

create policy item_tr_select on public.item_translations for select
  using (
    app.is_org_member(org_id)
    or exists (select 1
                 from public.items i
                 join public.categories c on c.id = i.category_id
                 join public.menus m on m.id = c.menu_id
                 join public.venues v on v.id = m.venue_id
                where i.id = item_id and v.is_published)
  );
create policy item_tr_write on public.item_translations for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy item_tr_update on public.item_translations for update
  using (app.is_org_member(org_id, 'editor'));
create policy item_tr_delete on public.item_translations for delete
  using (app.is_org_member(org_id, 'editor'));

-- allergens: global katalog, herkes okur; yazma yalnız service role (policy yok)
create policy allergens_select on public.allergens for select using (true);

-- item_allergens: misafir YALNIZCA confirmed satırları görür (İlke 3)
create policy item_alg_select on public.item_allergens for select
  using (
    app.is_org_member(org_id)
    or (state = 'confirmed' and exists (
          select 1
            from public.items i
            join public.categories c on c.id = i.category_id
            join public.menus m on m.id = c.menu_id
            join public.venues v on v.id = m.venue_id
           where i.id = item_id and v.is_published))
  );
create policy item_alg_write on public.item_allergens for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy item_alg_update on public.item_allergens for update
  using (app.is_org_member(org_id, 'editor'));
create policy item_alg_delete on public.item_allergens for delete
  using (app.is_org_member(org_id, 'editor'));

-- item_compliance: yalnız org içi (misafire iç mutfak gösterilmez)
create policy item_comp_select on public.item_compliance for select
  using (app.is_org_member(org_id));
create policy item_comp_write on public.item_compliance for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy item_comp_update on public.item_compliance for update
  using (app.is_org_member(org_id, 'editor'));

-- menu_ingestions: yalnız org içi
create policy ingest_select on public.menu_ingestions for select
  using (app.is_org_member(org_id));
create policy ingest_insert on public.menu_ingestions for insert to authenticated
  with check (app.is_org_member(org_id, 'editor') and uploaded_by = auth.uid());
create policy ingest_update on public.menu_ingestions for update
  using (app.is_org_member(org_id, 'editor'));

-- qr_codes: aktif kodlar yönlendirme için herkese okunur; yazma editor+
create policy qr_select on public.qr_codes for select
  using (is_active or app.is_org_member(org_id));
create policy qr_write on public.qr_codes for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy qr_update on public.qr_codes for update
  using (app.is_org_member(org_id, 'editor'));

-- scan_events: okumak org üyesine; INSERT policy YOK → yalnız service role yazar
create policy scan_select on public.scan_events for select
  using (app.is_org_member(org_id));

-- ----------------------------------------------------------------------------
-- 11) Seed — 14 AB/TR majör alerjen + TR'ye özgü beyanlar
-- ----------------------------------------------------------------------------
insert into public.allergens (id, code, name_tr, name_en, icon_slug, region_scope) values
  (1,  'gluten',      'Glüten içeren tahıllar',   'Cereals containing gluten', 'wheat',      'EU'),
  (2,  'crustaceans', 'Kabuklular',               'Crustaceans',               'shrimp',     'EU'),
  (3,  'eggs',        'Yumurta',                  'Eggs',                      'egg',        'EU'),
  (4,  'fish',        'Balık',                    'Fish',                      'fish',       'EU'),
  (5,  'peanuts',     'Yer fıstığı',              'Peanuts',                   'peanut',     'EU'),
  (6,  'soybeans',    'Soya',                     'Soybeans',                  'soy',        'EU'),
  (7,  'milk',        'Süt ve süt ürünleri',      'Milk',                      'milk',       'EU'),
  (8,  'nuts',        'Sert kabuklu meyveler',    'Tree nuts',                 'almond',     'EU'),
  (9,  'celery',      'Kereviz',                  'Celery',                    'celery',     'EU'),
  (10, 'mustard',     'Hardal',                   'Mustard',                   'mustard',    'EU'),
  (11, 'sesame',      'Susam',                    'Sesame seeds',              'sesame',     'EU'),
  (12, 'sulphites',   'Kükürt dioksit / sülfit',  'Sulphur dioxide/sulphites', 'sulphites',  'EU'),
  (13, 'lupin',       'Acı bakla (lüpen)',        'Lupin',                     'lupin',      'EU'),
  (14, 'molluscs',    'Yumuşakçalar',             'Molluscs',                  'mollusc',    'EU'),
  (15, 'alcohol',     'Alkol içerir',             'Contains alcohol',          'alcohol',    'TR'),
  (16, 'pork',        'Domuz türevi içerir',      'Contains pork derivatives', 'pork',       'TR');

-- ============================================================================
-- Notlar:
-- * scan_events'e istemciden insert yolu bilinçli olarak YOK (sahte olay koruması).
-- * Storage bucket'ları (menu-uploads: private, venue-media: public-read) Supabase
--   panel yerine 0002_storage.sql migration'ında tanımlanacak (M1).
-- * Abonelik/faturalama tabloları M5 migration'ında gelecek.
-- ===================================