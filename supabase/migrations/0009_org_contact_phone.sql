-- ============================================================================
-- RestaurantOS — 0009_org_contact_phone.sql (Faz B · B4)
-- Hesap sahibinin iletişim telefonu (ücretsiz plan şartı).
--
-- DİKKAT: bu, venues.phone'dan FARKLIDIR. venues.phone işletmenin misafire
-- gösterdiği numaradır; buradaki numara HESAP SAHİBİNE aittir ve misafire
-- gösterilmez (org tablosu, RLS ile yalnız üyeye okunur).
--
-- Şimdilik doğrulamasız toplanır; contact_phone_verified_at ileride SMS OTP
-- (Faz C) eklendiğinde doldurulacak. Nullable.
-- ============================================================================

alter table public.organizations
  add column if not exists contact_phone text
    check (contact_phone is null or char_length(contact_phone) between 6 and 32);

alter table public.organizations
  add column if not exists contact_phone_verified_at timestamptz;

comment on column public.organizations.contact_phone is
  'Hesap sahibinin iletişim telefonu (ücretsiz plan şartı). venues.phone ile karıştırma.';
comment on column public.organizations.contact_phone_verified_at is
  'SMS doğrulaması yapıldıysa zaman damgası (Faz C). Şimdilik daima null.';
