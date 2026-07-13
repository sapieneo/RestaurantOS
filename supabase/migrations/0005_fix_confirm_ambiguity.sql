-- ============================================================================
-- RestaurantOS — 0005_fix_confirm_ambiguity.sql
-- 0004'teki 3-arg geriye-uyum sarmalayıcısı, PostgREST adlı-argüman
-- çağrısında 4-arg imzayla belirsizlik ("could not choose the best candidate
-- function") yaratıyor. Sarmalayıcıyı kaldırıyoruz; 4-arg imza p_dietary_codes
-- default '{}' sayesinde eski çağrıları da karşılıyor.
-- ============================================================================

drop function if exists public.confirm_item_compliance(uuid, text[], boolean);
