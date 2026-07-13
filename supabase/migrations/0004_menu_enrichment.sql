-- ============================================================================
-- RestaurantOS — 0004_menu_enrichment.sql (Faz A)
-- İçindekiler alanı + diyet rozetleri (AI önerir, işletme onaylar)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) İçindekiler
-- ----------------------------------------------------------------------------
alter table public.items add column if not exists ingredients text;
comment on column public.items.ingredients is 'Ürün içindekiler listesi (misafir detay modalında gösterilir).';

-- ----------------------------------------------------------------------------
-- 2) Diyet etiketi kataloğu (genişletilebilir — yeni satır = yeni rozet)
-- ----------------------------------------------------------------------------
create table public.dietary_tags (
  id        smallint primary key,
  code      text not null unique,
  name_tr   text not null,
  name_en   text not null,
  icon_slug text not null
);

insert into public.dietary_tags (id, code, name_tr, name_en, icon_slug) values
  (1, 'halal',        'Helal',      'Halal',        'halal'),
  (2, 'alcohol_free', 'Alkolsüz',   'Alcohol-free', 'no-alcohol'),
  (3, 'vegan',        'Vegan',      'Vegan',        'vegan'),
  (4, 'vegetarian',   'Vejetaryen', 'Vegetarian',   'leaf');
-- Not: ileride 'glutenfree', 'spicy' vb. eklenebilir (kullanıcıya hatırlat).

-- ----------------------------------------------------------------------------
-- 3) Ürün-diyet ilişkisi (item_allergens aynası: guest YALNIZ confirmed görür)
-- ----------------------------------------------------------------------------
create table public.item_dietary (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  tag_id       smallint not null references public.dietary_tags(id),
  state        public.compliance_state not null default 'ai_suggested',
  confidence   numeric(4,3) check (confidence is null or confidence between 0 and 1),
  source       public.content_source not null default 'ai',
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz,
  primary key (item_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- 4) org_id otomatik doldurma — item_dietary'yi de kapsa
-- ----------------------------------------------------------------------------
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
    elsif tg_table_name in ('item_translations','item_allergens','item_compliance','item_dietary') then
      select i.org_id into new.org_id from public.items i where i.id = new.item_id;
    elsif tg_table_name = 'category_translations' then
      select c.org_id into new.org_id from public.categories c where c.id = new.category_id;
    end if;
  end if;
  return new;
end $$;

create trigger item_dietary_fill_org before insert on public.item_dietary
  for each row execute function app.fill_org_id();

-- ----------------------------------------------------------------------------
-- 5) RLS
-- ----------------------------------------------------------------------------
alter table public.dietary_tags enable row level security;
create policy dietary_tags_select on public.dietary_tags for select using (true);

alter table public.item_dietary enable row level security;
-- Misafir YALNIZCA confirmed diyet etiketini görür (uyum ilkesi)
create policy item_diet_select on public.item_dietary for select
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
create policy item_diet_write on public.item_dietary for insert to authenticated
  with check (app.is_org_member(org_id, 'editor'));
create policy item_diet_update on public.item_dietary for update
  using (app.is_org_member(org_id, 'editor'));
create policy item_diet_delete on public.item_dietary for delete
  using (app.is_org_member(org_id, 'editor'));

-- ----------------------------------------------------------------------------
-- 6) Onay RPC'si — alerjen + diyet + kaloriyi tek işlemde onaylar
-- Not: Eski 3-arg imza (0003) SİLİNMEZ; aşağıda 4-arg'a yönlendiren sarmalayıcı
-- olarak yeniden tanımlanır → mevcut çağıranlar kesintisiz çalışır.
-- ----------------------------------------------------------------------------
create or replace function public.confirm_item_compliance(
  p_item            uuid,
  p_allergen_codes  text[] default '{}',
  p_dietary_codes   text[] default '{}',
  p_calories_ok     boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_uid uuid := auth.uid();
begin
  select org_id into v_org from public.items where id = p_item;
  if v_org is null then
    raise exception 'Ürün bulunamadı' using errcode = 'no_data_found';
  end if;
  if not app.is_org_member(v_org, 'editor') then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = 'insufficient_privilege';
  end if;

  -- Alerjenler
  delete from public.item_allergens ia
   where ia.item_id = p_item
     and ia.allergen_id not in (select a.id from public.allergens a where a.code = any(p_allergen_codes));
  insert into public.item_allergens
    (item_id, org_id, allergen_id, state, source, confidence, confirmed_by, confirmed_at)
  select p_item, v_org, a.id, 'confirmed', 'verified', null, v_uid, now()
    from public.allergens a where a.code = any(p_allergen_codes)
  on conflict (item_id, allergen_id) do update
    set state='confirmed', source='verified', confirmed_by=v_uid, confirmed_at=now();

  -- Diyet etiketleri
  delete from public.item_dietary d
   where d.item_id = p_item
     and d.tag_id not in (select t.id from public.dietary_tags t where t.code = any(p_dietary_codes));
  insert into public.item_dietary
    (item_id, org_id, tag_id, state, source, confidence, confirmed_by, confirmed_at)
  select p_item, v_org, t.id, 'confirmed', 'verified', null, v_uid, now()
    from public.dietary_tags t where t.code = any(p_dietary_codes)
  on conflict (item_id, tag_id) do update
    set state='confirmed', source='verified', confirmed_by=v_uid, confirmed_at=now();

  -- İnceleme durumu
  insert into public.item_compliance
    (item_id, org_id, allergen_review, calories_review, reviewed_by, reviewed_at)
  values
    (p_item, v_org, 'confirmed',
     (case when p_calories_ok then 'confirmed' else 'pending' end)::public.compliance_state,
     v_uid, now())
  on conflict (item_id) do update
    set allergen_review = 'confirmed',
        calories_review = case when p_calories_ok then 'confirmed'::public.compliance_state
                               else public.item_compliance.calories_review end,
        reviewed_by = v_uid, reviewed_at = now();

  update public.items set allergens_confirmed = true where id = p_item;
end $$;

revoke all on function public.confirm_item_compliance(uuid, text[], text[], boolean) from public;
grant execute on function public.confirm_item_compliance(uuid, text[], text[], boolean) to authenticated;

-- Geriye dönük uyum: eski 3-arg imza → 4-arg (dietary boş)
-- Default'lar 0003'teki imzayla birebir aynı olmalı (create or replace default kaldıramaz).
create or replace function public.confirm_item_compliance(
  p_item uuid, p_allergen_codes text[] default '{}', p_calories_ok boolean default false
) returns void language sql security definer set search_path = public as $$
  select public.confirm_item_compliance(p_item, p_allergen_codes, '{}'::text[], p_calories_ok);
$$;
revoke all on function public.confirm_item_compliance(uuid, text[], boolean) from public;
grant execute on function public.confirm_item_compliance(uuid, text[], boolean) to authenticated;

-- unconfirm: diyet etiketlerini de sıfırla
create or replace function public.unconfirm_item_compliance(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from public.items where id = p_item;
  if v_org is null then
    raise exception 'Ürün bulunamadı' using errcode = 'no_data_found';
  end if;
  if not app.is_org_member(v_org, 'editor') then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = 'insufficient_privilege';
  end if;

  update public.item_allergens set state='ai_suggested', confirmed_by=null, confirmed_at=null where item_id=p_item;
  update public.item_dietary   set state='ai_suggested', confirmed_by=null, confirmed_at=null where item_id=p_item;
  update public.item_compliance
     set allergen_review='pending', calories_review='pending', reviewed_by=null, reviewed_at=null
   where item_id=p_item;
  update public.items set allergens_confirmed=false where id=p_item;
end $$;

revoke all on function public.unconfirm_item_compliance(uuid) from public;
grant execute on function public.unconfirm_item_compliance(uuid) to authenticated;
