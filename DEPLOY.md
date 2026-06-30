# RestaurantOS — Deploy Rehberi

## 1. Supabase Kurulumu

1. [supabase.com](https://supabase.com) → New project oluştur
2. **SQL Editor** → `supabase/schema.sql` içeriğini yapıştır → Run
3. **Project Settings → API** ekranından şunları kopyala:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (gizli tut!) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. OpenAI API Key

1. [platform.openai.com](https://platform.openai.com) → API Keys → Create new secret key
2. GPT-4o erişimin olduğundan emin ol (paid tier gerekiyor)
3. `OPENAI_API_KEY=sk-...`

## 3. Netgsm SMS

1. [netgsm.com.tr](https://www.netgsm.com.tr) → hesap aç, bakiye yükle
2. API kullanıcı kodu ve şifreni al
3. Onaylı mesaj başlığı (header) oluştur (ör: `RESTAURANTOS`)
4. Env:
   ```
   NETGSM_USERCODE=8501234567
   NETGSM_PASSWORD=sifreni_gir
   NETGSM_MSGHEADER=RESTAURANTOS
   ```

## 4. iyzico Ödeme

### Sandbox (geliştirme)
1. [iyzico.com](https://iyzico.com) → Merchant hesabı aç
2. Merchant Panel → Ayarlar → API anahtarları → **Sandbox** anahtarlarını al
3. Env:
   ```
   IYZICO_API_KEY=sandbox-...
   IYZICO_SECRET_KEY=sandbox-...
   ```
4. `app/api/payment/init/route.ts` dosyasında comment'i kaldır (iyzico entegrasyon bloğu)

### Production
- `IYZICO_BASE_URL` değerini `https://api.iyzipay.com` yap

## 5. Google Vision (Opsiyonel — OCR fallback)

OpenAI Vision yeterli olduğu için isteğe bağlıdır.

1. [console.cloud.google.com](https://console.cloud.google.com) → Vision API etkinleştir
2. Service Account oluştur → JSON key indir
3. JSON içeriğini tek satıra çevir:
   ```bash
   cat key.json | tr -d '\n'
   ```
4. `GOOGLE_VISION_CREDENTIALS={"type":"service_account",...}`

## 6. Vercel Deploy

```bash
# 1. Vercel CLI kur
npm i -g vercel

# 2. Projeyi deploy et
cd restaurantos
vercel

# 3. Soruları yanıtla:
#   Project name: restaurantos
#   Framework: Next.js (otomatik algılar)
#   Root directory: ./

# 4. Environment variables ekle
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add OPENAI_API_KEY production
vercel env add NETGSM_USERCODE production
vercel env add NETGSM_PASSWORD production
vercel env add NETGSM_MSGHEADER production
vercel env add IYZICO_API_KEY production
vercel env add IYZICO_SECRET_KEY production
vercel env add NEXT_PUBLIC_APP_URL production

# 5. Son deploy
vercel --prod
```

### Alternatif: Vercel Dashboard

1. [vercel.com/new](https://vercel.com/new) → GitHub repo bağla
2. Environment Variables bölümüne yukarıdaki değerleri ekle
3. Deploy

## 7. Özel Domain

1. Vercel → Project → Settings → Domains → `restaurantos.app` ekle
2. DNS'e CNAME kaydı ekle: `cname.vercel-dns.com`
3. `NEXT_PUBLIC_APP_URL=https://restaurantos.app` güncelle

## 8. Supabase Auth Callback URL

Supabase → Authentication → URL Configuration:
- Site URL: `https://restaurantos.app`
- Redirect URLs: `https://restaurantos.app/**`

## 9. Supabase Storage (Ürün fotoğrafları için)

```sql
-- Supabase SQL Editor'da çalıştır
insert into storage.buckets (id, name, public) values ('menu-images', 'menu-images', true);

create policy "Public read"
  on storage.objects for select using (bucket_id = 'menu-images');

create policy "Auth upload"
  on storage.objects for insert
  with check (bucket_id = 'menu-images' and auth.role() = 'authenticated');
```

## 10. Kontrol Listesi

- [ ] Supabase schema.sql çalıştırıldı
- [ ] 14 alerjen seed verisi mevcut (`select count(*) from allergens`)
- [ ] Tüm env variable'lar Vercel'e eklendi
- [ ] `NEXT_PUBLIC_APP_URL` production URL'si güncellendi
- [ ] Netgsm SMS test gönderimi yapıldı
- [ ] iyzico sandbox ödeme testi geçti
- [ ] `/m/[slug]` public menü sayfası açılıyor
- [ ] QR kod doğru URL'e yönlendiriyor

## Geliştirme Ortamı

```bash
npm install
cp .env.local.example .env.local
# .env.local dosyasını doldur
npm run dev
# http://localhost:3000
```
