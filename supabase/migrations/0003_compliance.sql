-- ============================================================================
-- RestaurantOS — 0003_compliance.sql (M2 · Uyum Motoru)
-- Onay akışı RPC'si + misafir-okunur "onaylı" sinyali
-- Uygulama: supabase db push
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Misafir-okunur onay sinyali
-- ----------------------------------------------------------------------------
-- item_compliance misafire KAPALIDIR (iç mutfak). Misafir menüsünde "alerjen
-- bilgisi onaylı" rozetini gösterebilmek için items üzerinde denormalize,
-- guest-okunur bir bayrak tutarız. Değeri yalnızca confirm RPC'si yönetir.
alter table public.items
  add column if not exists allergens_confirmed boolean not null default false;

comment on column public.items.allergens_confirmed is
  'Alerjen incelemesi işletmece onaylandı mı (rozet sinyali). Yalnız app.confirm_item_compliance yazar.';

-- ----------------------------------------------------------------------------
-- 2) Ürün uyum onayı — tek işlemde atomik
-- ----------------------------------------------------------------------------
-- p_allergen_codes : onaylanan NİHAİ alerjen kod listesi.
--                    Boş dizi = "alerjensiz" beyanı (bu da geçerli bir onaydır).
-- p_calories_ok    : kalori değeri incelendi ve doğru olarak onaylandı mı.
--
-- Etkisi:
--   * Sette olmayan mevcut alerjen satırları silinir (AI'nin yanlış önerisi reddi).
--   * Onaylanan alerjenler state='confirmed', source='verified', confirmed_by/at ile yazılır.
--   * item_compliance.allergen_review='confirmed' (+ opsiyonel calories_review).
--   * items.allergens_confirmed=true → misafir rozeti açılır.
-- SECURITY DEFINER: RLS'i atlar ama içeride editor üyeliği açıkça doğrulanır.
-- public şemasında: PostgREST üzerinden supabase.rpc() ile çağrılabilir.
create or replace function public.confirm_item_compliance(
  p_item            uuid,
  p_allergen_codes  text[] default '{}',
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

  -- Onaylanan sette OLMAYAN mevcut alerjen satırlarını kaldır
  delete from public.item_allergens ia
  where ia.item_id = p_item
    and ia.allergen_id not in (
      select a.id from public.allergens a where a.code = any(p_allergen_codes)
    );

  -- Onaylanan alerjenleri confirmed olarak yaz/güncelle
  insert into public.item_allergens
    (item_id, org_id, allergen_id, state, source, confidence, confirmed_by, confirmed_at)
  select p_item, v_org, a.id, 'confirmed', 'verified', null, v_uid, now()
    from public.allergens a
   where a.code = any(p_allergen_codes)
  on conflict (item_id, allergen_id) do update
    set state        = 'confirmed',
        source       = 'verified',
        confirmed_by = v_uid,
        confirmed_at = now();

  -- İnceleme durumunu güncelle (satır yoksa oluştur)
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
        reviewed_by     = v_uid,
        reviewed_at     = now();

  -- Misafir rozet sinyali
  update public.items set allergens_confirmed = true where id = p_item;
end $$;

revoke all on function public.confirm_item_compliance(uuid, text[], boolean) from public;
grant execute on function public.confirm_item_compliance(uuid, text[], boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- 3) Onayı geri alma (düzenleme sırasında gerekebilir)
-- ----------------------------------------------------------------------------
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

  update public.item_allergens
     set state = 'ai_suggested', confirmed_by = null, confirmed_at = null
   where item_id = p_item;

  update public.item_compliance
     set allergen_review = 'pending', calories_review = 'pending',
         reviewed_by = null, reviewed_at = null
   where item_id = p_item;

  update public.items set allergens_confirmed = false where id = p_item;
end $$;

revoke all on function public.unconfirm_item_compliance(uuid) from public;
grant execute on function public.unconfirm_item_compliance(uuid) to authenticated;
