-- ============================================================================
-- RestaurantOS — 0006_multipage_menu.sql (Faz A)
-- Çok sayfalı menü: her yükleme, işletmenin TEK menüsüne kategori ekler.
-- Kategorilere hangi yüklemeden (ingestion) geldiği bilgisi eklenir ki
-- yeniden onayda yalnız o yüklemenin katkısı güncellensin.
-- ============================================================================

alter table public.categories
  add column if not exists ingestion_id uuid
    references public.menu_ingestions(id) on delete set null;

create index if not exists categories_ingestion_idx on public.categories (ingestion_id);

comment on column public.categories.ingestion_id is
  'Bu kategorinin geldiği menü yüklemesi (çok sayfalı menüde idempotent yeniden onay için).';
