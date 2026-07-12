-- ============================================================================
-- RestaurantOS — 0002_storage.sql (M1)
-- Storage bucket'ları ve erişim politikaları
-- Yol kuralı: {org_id}/{dosya}  →  politika ilk klasörden org üyeliği doğrular
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('menu-uploads', 'menu-uploads', false, 20971520,  -- 20 MB
   array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('venue-media',  'venue-media',  true,  10485760,  -- 10 MB
   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- menu-uploads: yalnız org üyesi (editor+) kendi org klasörüne yazar/okur
create policy "menu_uploads_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'menu-uploads'
    and app.is_org_member((split_part(name, '/', 1))::uuid, 'editor')
  );
create policy "menu_uploads_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'menu-uploads'
    and app.is_org_member((split_part(name, '/', 1))::uuid)
  );
create policy "menu_uploads_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'menu-uploads'
    and app.is_org_member((split_part(name, '/', 1))::uuid, 'editor')
  );

-- venue-media: herkese okuma (public bucket), org üyesine yazma
create policy "venue_media_select" on storage.objects for select
  using (bucket_id = 'venue-media');
create policy "venue_media_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'venue-media'
    and app.is_org_member((split_part(name, '/', 1))::uuid, 'editor')
  );
create policy "venue_media_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'venue-media'
    and app.is_org_member((split_part(name, '/', 1))::uuid, 'editor')
  );
