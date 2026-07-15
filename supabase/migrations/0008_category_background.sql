-- ============================================================================
-- RestaurantOS — 0008_category_background.sql (Faz A · A8)
-- Kategori arka plan görseli: misafir menüsünde kategori başlığının arkasında
-- gösterilen atmosferik banner. AI ile üretilir veya elle yüklenir; görsel
-- venue-media bucket'ında saklanır, burada yalnız public URL tutulur.
-- ============================================================================

alter table public.categories
  add column if not exists background_url text;

comment on column public.categories.background_url is
  'Kategori arka plan görseli (venue-media public URL). Misafir menüsünde banner.';
