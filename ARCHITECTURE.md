# RestaurantOS — Mimari Doküman (M0)

Sürüm: 0.1 · Tarih: 12 Temmuz 2026 · Durum: Tartışmaya açık taslak

---

## 1. Amaç ve v1 Kapsamı

RestaurantOS, işletmelerin mevcut menülerini (fotoğraf/PDF) dakikalar içinde yasal
mevzuata uyumlu, çok dilli, hızlı bir dijital QR menüye dönüştüren SaaS platformudur.

**v1 kapsamı (kararlaştırıldı):** Menü + AI + Uyum.

- AI onboarding: fotoğraf/PDF → yapılandırılmış menü taslağı → insan onayı → yayın
- Uyum motoru: 14 alerjen + kalori çıkarımı, işletme onayı, denetime hazırlık raporu
- Çok dilli menü (AI çeviri + manuel düzeltme), venue bazında para birimi
- Çerezsiz analitik (tarama, ürün görüntüleme)
- Ölmeyen QR (yönlendirme katmanı)

**v1'de YOK:** sipariş, ödeme, POS/adisyon, rezervasyon. Şema bunları dışlamaz,
ama v1 kodu bunlara dokunmaz.

**Pazar:** Lansman TR (mevzuat takvimi: 1 Temmuz 2026 ulusal zincirler — geçti;
31 Aralık 2026 aynı ilde 3+ şube). Mimari ilk günden çok ülkeli: i18n, çoklu para
birimi, ülkeden bağımsız şema.

---

## 2. İlkeler

1. **Tek altın yol.** Kullanıcının yaşadığı tek akış: yükle → düzelt → uyum → yayınla.
   Her adım kesintiye dayanıklı; yarım iş kaybolmaz (ingestion durum makinesi, DB'de).
2. **Güven veren sağlamlık.** Gerçek auth (localStorage oturumu yok), her tabloda RLS,
   her şema değişikliği migration ile, yayına giden yolda otomatik test, Sentry izleme.
3. **Uyum damgası ancak insan onayıyla.** AI önerir, işletme onaylar. Onaysız ürün
   menüde "uyumlu" görünmez. Yasal sorumluluk işletmede kalır; biz kolaylaştırıcıyız.
4. **Basılı QR asla ölmez.** QR sabit bir yönlendirme adresine basılır (`/q/{kod}`).
   Slug, menü, işletme adı değişse de eski baskılar çalışır.
5. **Hız bir özelliktir.** Misafir menüsü statik/edge-cache; zayıf 3G'de < 1 sn hedefi.

---

## 3. Stack ve Temel Kararlar (mini-ADR)

| # | Karar | Gerekçe | Alternatif (red) |
|---|-------|---------|------------------|
| A1 | Next.js 14+ App Router + TypeScript + Tailwind, Vercel | Ekip bilgisi mevcut, ISR/edge cache yayın katmanı için ideal | Remix, SvelteKit |
| A2 | Supabase (Postgres + Auth + Storage + RLS) | Tek platformda DB/auth/dosya; RLS ile çok kiracılılık | Ayrı auth servisi |
| A3 | **AI sağlayıcı: Anthropic Claude (vision + yapılandırılmış JSON çıktı)** | Tek çağrıda OCR + yapılandırma; mevcut repo deneyimi; ayrı OCR servisi (Google Vision) gereksiz katman | GPT-4o + Google Vision (iki sağlayıcı, iki fatura, iki hata yüzeyi) |
| A4 | Auth: Supabase anonymous sign-in → yayında e-posta magic link / Google OAuth ile hesaba dönüşüm | "Kayıt olmadan dene" hunisi korunur; telefon OTP TR'ye hapsederdi. Netgsm/SMS tamamen çıkar | Telefon OTP |
| A5 | RLS stratejisi: her kiracı tablosunda **denormalize `org_id`** + tek tip `is_org_member()` politikası | Join'li RLS politikaları yavaş ve hataya açık; trigger org_id'yi parent'tan otomatik doldurur | Her tabloda join'le yukarı yürüyen politika |
| A6 | Node.js runtime (Edge runtime değil) API route'larda | iyzico ve ağır AI çağrıları uyumluluğu | Edge functions |
| A7 | Ödeme (M5'e ertelendi): TR → iyzico, global → Stripe; tek-MoR (Paddle) seçeneği M5'te yeniden değerlendirilecek | v1'de faturalama yok, freemium ile çıkılır | — |
| A8 | Misafir sayfası ISR + `revalidateTag`: yayınla eylemi cache'i anında tazeler | Hem hız hem anlık güncellik | Tam SSR (yavaş), tam statik (bayat) |

---

## 4. Domain Modeli

```
auth.users (Supabase)
    │  organization_members (rol: owner/admin/editor/viewer)
    ▼
organizations ── plan (free/pro/enterprise), country_code
    ▼
venues ── slug, para birimi, varsayılan dil, iletişim, marka
    ▼
menus ── (bir mekânda birden çok menü: yemek, içecek, kahvaltı…)
    ▼
categories ── sıralama
    ▼
items ── fiyat, görsel, kalori, müsaitlik
    ├── item_translations (dil bazında ad/açıklama, kaynak: ai|manual)
    ├── item_allergens  (alerjen × durum × güven skoru × onaylayan)
    └── item_compliance (ürün bazında inceleme durumu — alerjen + kalori)

Yan tablolar:
- allergens: 14 AB/TR majör alerjen + TR'ye özgü beyanlar (alkol, domuz) — global seed
- menu_ingestions: AI içe aktarma işleri (durum makinesi)
- qr_codes: kısa kod → venue yönlendirmesi (masa/broşür etiketi opsiyonel)
- scan_events: çerezsiz analitik olayları
- category_translations: kategori adı çevirileri
```

**Neden `item_compliance` ayrı tablo?** "Bu üründe hiç alerjen yok" da bir beyandır.
`item_allergens`'ta satır olmaması "incelenmedi" mi "alerjensiz" mi ayırt edilemez.
`item_compliance` ürün başına inceleme durumunu (pending → ai_suggested → confirmed)
tek satırda tutar; denetim raporu bu tablodan üretilir.

---

## 5. Kimlik ve Oturum Akışı

```
Ziyaretçi "Menünü oluştur"a basar
  → supabase.auth.signInAnonymously()      (gerçek JWT, authenticated rol, is_anonymous=true)
  → org + venue taslağı açılır (RLS normal çalışır, hack yok)
  → studyo akışı: yükle → düzelt → uyum
Yayınla adımında:
  → linkIdentity(email magic link | Google)  (anonim hesap kalıcı hesaba DÖNÜŞÜR,
     org/venue/menü verisi aynı user_id'de kalır — veri taşıma yok)
  → yayın tamamlanır, dashboard açılır
```

- Anonim hesaplar 30 gün işlem görmezse temizlenir (zamanlanmış job, M4).
- `organization_members` kaydı org oluşturulurken trigger ile `owner` olarak atılır.
- Davet akışı (admin/editor ekleme) M4.

---

## 6. AI İçe Aktarma Boru Hattı (menu_ingestions)

```
[uploaded] → [processing] → [review] → [approved]
                  │
                  └→ [failed] (hata mesajı + yeniden dene)
```

1. **uploaded:** Dosya `menu-uploads` bucket'ına (private) yazılır, ingestion satırı açılır.
2. **processing:** API route (Node runtime) Claude vision'a gönderir. Çıktı: katı JSON
   şeması (zod ile doğrulanır) — kategoriler, ürünler, fiyatlar, para birimi tahmini,
   alerjen/kalori önerileri + güven skorları. Ham çıktı `raw_result` (jsonb) alanına yazılır.
3. **review:** Kullanıcı studyoda düzeltir. Onayladığı her parça normal tablolara yazılır.
   Sayfa yenilense/oturum kesilse bile ingestion + taslak tablolar durumu korur.
4. **approved:** İçe aktarma kapanır; menü yayına hazır.

Kurallar: her adım idempotent (aynı ingestion iki kez işlenirse çift ürün oluşmaz —
`raw_result` hash kontrolü), AI çağrıları sunucu tarafında, API anahtarı asla istemciye inmez.

---

## 7. Uyum Motoru

- AI her ürün için 14+2 alerjen önerisi ve kalori tahmini üretir → `item_allergens`
  satırları `ai_suggested` durumunda, güven skoruyla.
- İşletme studyoda ürün ürün onaylar/düzeltir → durum `confirmed`, `confirmed_by` + zaman damgası.
- Misafir menüsünde alerjen rozetleri **yalnızca confirmed** veriden çizilir.
- **Denetime hazırlık ekranı (M2):** eksik incelemesi olan ürün listesi, yönetmelik
  takvimi, "uyum raporu indir" (PDF). Rapor: ürün × alerjen matrisi + onay zinciri
  (kim, ne zaman) — denetimde işletmenin eline verilecek belge.
- Kalori: `calories_kcal` + `calories_source` (ai|manual|verified). AI tahmini onaysız yayınlanmaz.

---

## 8. Yayın Katmanı ve QR

- Misafir menüsü: `restaurantos.app/m/{venue-slug}` — ISR ile statik üretilir,
  `yayınla` eylemi `revalidateTag(venue)` çağırır. Görseller Supabase Storage +
  Next/Image ile optimize. Hedef: LCP < 1 sn (3G), toplam JS < 100 KB.
- QR yönlendirme: `restaurantos.app/q/{kod}` → 302 → güncel menü URL'si.
  `qr_codes.code` 8 karakterlik sabit kısa kod. Yönlendirme anında `scan_events`'e
  olay düşer (bekletmeden, fire-and-forget).
- SEO: menü sayfalarında schema.org `Menu` markup, venue bazlı OG görseli.
- Özel alan adı (işletmenin kendi domaini) → M4 sonrası, şemada `venues.custom_domain` rezerve.

---

## 9. Analitik (çerezsiz)

- Olaylar: `scan` (QR), `menu_view`, `item_view`, `language_switch`.
- Oturum anahtarı: `hash(ip + user-agent + günlük salt)` — kişisel veri saklanmaz,
  çerez/consent banner gerekmez (KVKK/GDPR dostu). IP ham halde tutulmaz.
- Yazma yolu: yalnızca sunucu (service role). İstemciden doğrudan insert yok →
  RLS'de anon insert kapalı, sahte olay şişirmesi engellenir.
- Okuma: org üyeleri, kendi org'ları. Pano M4'te.

---

## 10. Güvenlik Modeli

- **RLS her tabloda açık.** Tek tip politika: `app.is_org_member(org_id [, min_rol])`
  (SECURITY DEFINER, `organization_members`'a bakar). Denormalize `org_id` trigger'la dolar.
- **Public okuma:** yayınlanmış venue'nun menü zinciri (venues → items → translations)
  anon'a SELECT açık, `is_published = true` şartıyla. Taslaklar asla sızmaz.
- **Storage:** `menu-uploads` private (yalnız org üyeleri + service role),
  `venue-media` public-read (menü görselleri CDN'den servis edilir).
- **Rate limiting:** AI uçları kullanıcı başına (Upstash/Vercel KV, M1'de basit sayaç).
- **Gizli anahtarlar:** yalnız Vercel env; `SUPABASE_SERVICE_ROLE_KEY` yalnız server.

---

## 11. Ortamlar, CI ve Kalite Kapıları

- Ortamlar: `production` (main) · `preview` (PR başına, Vercel) · `local` (supabase CLI).
- Migration disiplini: tüm şema `supabase/migrations/*.sql`; panelden elle şema değişikliği YASAK.
- CI (GitHub Actions): typecheck + lint + unit test + **migration'ları boş Postgres'e uygulama testi**.
- İzleme: Sentry (hata), Vercel Analytics (performans), Supabase log drains.
- Yedekleme: Supabase günlük otomatik + haftalık manuel dışa aktarım (M4'te otomatikleştir).

---

## 12. Milestone Planı

| M | İçerik | Kabul kriteri |
|---|--------|---------------|
| **M0** | Repo, bu doküman, şema + RLS migration, CI iskeleti | Migration boş DB'ye temiz uygulanıyor; RLS testleri geçiyor |
| **M1** | Anonim auth + studyo yükleme + AI çıkarma (ingestion makinesi) | Fotoğraftan düzenlenebilir taslak menü < 60 sn |
| **M2** | Uyum motoru: alerjen/kalori onay akışı + denetime hazırlık ekranı + rapor | Onaysız ürün menüde rozet göstermiyor; PDF rapor iniyor |
| **M3** | Yayın: misafir sayfası (ISR), QR üretimi + `/q/` yönlendirme, çok dil | 3G'de LCP < 1 sn; QR slug değişiminde kırılmıyor |
| **M4** | Dashboard: menü düzenleme, analitik panosu, üye daveti, hesap dönüşümü cilası | Anonim → kalıcı hesap dönüşümü veri kaybısız |
| **M5** | Faturalama: freemium sınırları + Pro (iyzico; Stripe/Paddle kararı burada) | Ücretsiz plan sınırları uygulanıyor, Pro satın alınabiliyor |

Her milestone tek başına çalışır durumda biter ve production'a çıkar.

---

## 13. Açık Sorular (sonraki tartışmalar)

1. Misafir menü URL yapısı: `restaurantos.app/m/{slug}` mi, `{slug}.restaurantos.menu` mü?
   (Alt alan adı markaya daha "sahipli" hissettirir, wildcard DNS + Vercel yapılandırması ister.)
2. Ücretsiz planın sınırları ne? (öneri: 1 venue, 1 menü, 30 ürün, rozet, aylık 500 tarama analitiği)
3. AI görsel üretimi (FineDine/MenuForma'daki gibi yemek fotoğrafı) v1'e girer mi, maliyeti kim öder?
4. `n8n` otomasyonu v1'de gerekli mi, yoksa cron + API route yeter mi? (öneri: v1'de n8n yok)
5. Alerjen seed'ine TR'ye özgü alkol/domuz beyanı "extended" olarak eklendi — başka ülke
   açılırken ülke-bazlı beyan seti nasıl yönetilecek? (öneri: `allergens.region_scope`)
