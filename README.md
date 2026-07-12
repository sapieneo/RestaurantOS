# RestaurantOS

Menü fotoğrafından, yönetmeliğe uyumlu çok dilli QR menüye — dakikalar içinde.

Durum: **M1** (anonim auth + AI menü çıkarma + taslak düzenleme). Mimari için `ARCHITECTURE.md`.

## Kurulum

1. **Supabase projesi aç** ve migration'ları uygula:
   ```bash
   npx supabase link --project-ref <proje-ref>
   npx supabase db push
   ```
   Supabase panelinde **Authentication → Providers → Anonymous sign-ins** seçeneğini aç.

2. **Ortam değişkenleri:** `.env.example` → `.env.local` kopyala, doldur.

3. **Çalıştır:**
   ```bash
   npm install
   npm run dev
   ```

## Doğrulama

```bash
npm run typecheck   # TS denetimi
npm run test:rls    # Şema + RLS testleri (gömülü Postgres, servis gerekmez)
```

## M1'de ne var

- `/` → `/studyo`: kayıt istemeden anonim oturum, org+venue taslağı (`/api/bootstrap`)
- Fotoğraf/PDF yükleme → `menu-uploads` bucket (org klasörü, RLS'li)
- `/api/ingest`: Claude vision ile yapılandırılmış çıkarma; zod doğrulama;
  durum makinesi `uploaded → processing → review | failed`; aynı dosya için idempotent
- `/studyo/[id]`: taslak düzenleyici — kategori/ürün/fiyat düzenle, sil, ekle;
  AI alerjen önerileri güven skoruyla görünür (onay akışı M2)
- `/api/ingest/[id]/approve`: taslağı `menus → categories → items` +
  `item_allergens (ai_suggested)` + `item_compliance (pending)` olarak yazar;
  yeniden onay çoğaltma yaratmaz

## Sırada (M2)

Alerjen/kalori onay akışı, denetime hazırlık ekranı, PDF uyum raporu.

## Vercel notları

- `/api/ingest` için `maxDuration = 120` tanımlı — Hobby planda Fluid Compute
  açık olmalı ya da Pro plan kullanılmalı.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (ops.).
