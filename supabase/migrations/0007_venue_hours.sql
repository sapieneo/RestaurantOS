-- ============================================================================
-- RestaurantOS — 0007_venue_hours.sql (Faz A · A9)
-- Misafir menüsü iletişim footer'ı için çalışma saati alanı.
-- Serbest metin: "Her gün 09:00–23:00" gibi; ileride yapılandırılmış saatlere
-- (haftalık jsonb) geçilebilir. Nullable — boşsa footer'da gösterilmez.
-- ============================================================================

alter table public.venues
  add column if not exists opening_hours text;

comment on column public.venues.opening_hours is
  'İşletme çalışma saatleri (serbest metin, misafir menüsü footer''ında gösterilir).';
