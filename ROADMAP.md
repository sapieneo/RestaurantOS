# RestaurantOS — Yol Haritası

Bu dosya, üzerinde anlaştığımız işlerin sırasını tutar. Tamamlananları işaretleyerek ilerliyoruz.

## Tamamlanan
- **M0** temel: çok kiracılı şema + RLS + 16 alerjen seed.
- **M1** AI çıkarma: fotoğraf/PDF → Claude vision → taslak → onayla & kaydet.
- **M2** uyum motoru: alerjen/kalori onay akışı, denetim ekranı, PDF uyum raporu.
- **Deploy**: Supabase projesi (`vaqhdaaqdsgfajqdvzls`) migration'ları uygulandı, anonim giriş açık, kod GitHub'da (`sapieneo/RestaurantOS`), yerelde uçtan uca çalışıyor (menü fotoğrafı okundu).

---

## Faz A — Menü editörü + misafir menüsü zenginleştirme (ŞİMDİ)
Menucraft'taki olgunluğu yeni mimariye taşıyoruz. İlke: güçlü ama **temiz ve sade** arayüz; kullanıcıyı bilgiyle boğmadan, gelişmiş alanlar katlanır/opsiyonel.

- **A1 · Para birimi seçimi.** `venues.currency_code` kullanıcı tarafından seçilir (₺, $, €, £, …). Fiyatlar editörde ve misafir menüsünde doğru sembolle gösterilir (ör. `600 ₺`). Zorunlu ₺ yok.
- **A2 · Kalori (porsiyon).** AI porsiyon kalorisi tahmin eder; editörde düzenlenir, M2'de onaylanır; misafirde "KALORİ (PORSİYON)".
- **A3 · İçindekiler.** YENİ `items.ingredients` alanı. AI önerir; misafir detay modalında "İÇİNDEKİLER".
- **A4 · Diyet rozetleri.** Helal, Alkolsüz, Vegan, Vejetaryen (+ ops. acılı). YENİ diyet bayrakları (şema). Uyum ilkesiyle: AI önerir → işletme onaylar → misafir çipi.
- **A5 · Elle ekleme. ✅ TAMAMLANDI.** Editörde elle ürün ekle (var) **ve** kategori ekle ("+ Kategori ekle"); kategori sil.
- **A6 · Sıralama. ✅ TAMAMLANDI.** Ürünleri ve kategorileri ok tuşlarıyla yukarı/aşağı taşı. `sort_order` approve'da dizi sırasından yazılır (şema değişikliği yok). Sıralama/ekleme "Yeniden Kaydet" ile canlıya yansır.
- **Tahribatsız yeniden kaydetme. ✅ TAMAMLANDI.** Approve, silmeden önce mevcut alerjen/diyet/kalori onaylarını (kategori adı + ürün adı) anahtarıyla anımsar ve yeniden oluşturulan ürünlere geri uygular. Sıralama/düzenleme sonrası "Yeniden Kaydet" onayları KORUR; yalnız adı değişen/yeni ürünler tekrar 'pending' olur. Yanıt `restoredCount` döner.
- **A7 · Ürün görseli (AI). ✅ TAMAMLANDI.** `/studyo/gorseller`: Runware ile AI görsel üretimi (FLUX.1 schnell varsayılan), yeniden üret, elle yükle, kaldır. Görsel venue-media'ya kalıcı kaydedilir, `items.image_url` yazılır, misafir menüsünde görünür. `RUNWARE_API_KEY` gerekir. (Ücretli katman gating'i Faz C'de.)
- **A8 · Kategori arka planı.** Kategoriyi temsil eden arka plan görseli (opsiyonel; ücretli katman).
- **A9 · Misafir menüsü (M3). ✅ TAMAMLANDI.** `/m/[slug]` genel menü ekranı: yapışkan kategori sekmeleri (scroll-spy), ürün satırları, detay modalı (içindekiler + alerjen + kalori + rozet + "işletme beyanı" notu), iletişim & bilgi footer'ı (adres, harita, telefon, whatsapp, instagram, çalışma saati, wifi). Uyum ekranından "Misafir menüsünü önizle" linki. Yeni migration: `0007_venue_hours.sql` (venues.opening_hours).

Kabul: taslak editöründe para birimi/kalori/içindekiler/rozet düzenlenip onaylanabiliyor; misafir menüsü örnek ekranlardaki gibi zengin görünüyor; ücretsiz sınırları aşan görsel özellikler kilitli.

## Faz B — Yayın + QR + hesap (M3/M4)
- **İşletme ayarları ekranı. ✅ TAMAMLANDI.** `/studyo/ayarlar`: ad, açıklama, para birimi, adres, harita, telefon, whatsapp, instagram, çalışma saati, wifi düzenleme (PATCH /api/venue, RLS editor). Misafir menüsü footer'ını doldurur. Editör 'kaydedildi' ve uyum ekranlarından erişilir.
- **B1 · Yayınlama akışı. ✅ TAMAMLANDI.** `/studyo/ayarlar` yayın kartı: TASLAK/CANLI rozeti, "Yayınla / Yayından kaldır", canlı link kopyalama. `PATCH /api/venue` artık **kısmi güncelleme** yapıyor (yalnız gelen alanlar yazılır) ve `isPublished` + `slug` kabul ediyor. `published_at` yalnız ilk yayında yazılır, yayından kaldırınca silinmez (arşiv). Yayın öncesi alerjen onayı bekleyen ürün sayısı gösterilir ve onay istenir — bloke edilmez (beyan sorumluluğu işletmede). Menü adresi (slug) düzenlenebilir; unique çakışması 409 + Türkçe mesaj.
- **B2 · QR yönlendirme. ✅ TAMAMLANDI.** `/studyo/qr`: etiketli kod üretimi ("Masa 4"), etiket düzenleme, devre dışı bırakma (kod ASLA silinmez), PNG + baskıya hazır A6 masa kartı PDF indirme. `/q/{code}` yönlendirme: kod yok / devre dışı / menü yayında değil durumları ayrı ayrı ele alınır. Kod okuması **service-role** ile yapılır çünkü `qr_select` policy'si (`is_active or is_org_member`) anonime pasif kodu göstermez → "yok" ile "pasif" ayrımı yapılamazdı. **Not:** `qr_codes.org_id` NOT NULL ama `app.fill_org_id` trigger'ı bu tabloyu kapsamıyor; org_id API'de venue'dan okunup elle yazılıyor (migration gerekmedi).
- **B3 · Çerezsiz analitik. ✅ TAMAMLANDI.** `src/lib/analytics.ts`: `session_key = sha256(günlük salt + ip + user-agent)`. Salt her gün yeniden üretilir, **hiçbir yerde saklanmaz** → ertesi gün geriye dönük eşleştirme yapılamaz, çerez izni bandı gerekmez. Salt `globalThis`'te tutulur (modül seviyesi YETMEZ: Next her route'u ayrı bundle'a derler, her kopya kendi salt'ını üretip tekil sayımı bozar). Olaylar: `scan` → `/q/{code}` render'ında (qr_code_id ile, hangi masa tarandı), `menu_view` → `/m/{slug}` render'ında (yalnız yayındaysa; sahibin önizlemesi sayılmaz), `item_view` → `POST /api/scan` (istemci, oturum başına ürün başına bir kez). Bot/link-önizleme user-agent'ları elenir. Yazma yalnız service-role (scan_events'te INSERT policy yok). `/api/scan` public olduğu için: venue yayında mı + ürün gerçekten o org'a ait mi + IP başına 60 istek/dk sınırı. Middleware misafir yollarında oturum çerezi yoksa erken çıkar (her QR okutmasında gereksiz `getUser()` yapılmaz).
- **B4 · Hesap kalıcılaştırma. ✅ TAMAMLANDI (magic link).** Anonim oturum `updateUser({email})` ile e-postaya bağlanır — `user.id` KORUNUR (ham GoTrue PUT /user ile doğrulandı: 200, id değişmedi, `new_email` + `email_change_sent_at` set). Yeni hesap açılmaz, veri taşınmaz, org sahipliği aynen kalır. `/auth/callback` PKCE `exchangeCodeForSession`; kod yok/geçersiz/süresi dolmuş/e-posta kayıtlı durumları için ayrı Türkçe mesaj. `/studyo/hesap` "Hesabını güvene al" kartı (GEÇİCİ/GÜVENDE rozeti) + studyo girişinde anonim uyarı bandı. Telefon: `organizations.contact_phone` (hesap sahibinin numarası — `venues.phone` DEĞİL), doğrulamasız (SMS Faz C). **Google:** kod hazır (`linkIdentity` + aynı callback), yalnız Supabase paneli + Google Cloud OAuth kurulumu bekliyor. **Bekleyen manuel adım:** `0009_org_contact_phone.sql` Supabase'e uygulanmalı (yoksa telefon yazımı `42703` verir; e-posta akışı bundan bağımsız çalışır).
- Dashboard: menü yönetimi, temel analitik (çerezsiz `scan_events`).

## Faz C — Freemium + faturalama (M5)
- **Ücretsiz plan** (üyelik + telefon şartıyla): 1 venue, **< 50 ürün**, **5 dile** çeviri, arka plan/ürün görseli **YOK**, "RestaurantOS" rozeti.
- **Pro**: sınırsız/yüksek ürün, tüm diller, ürün + kategori görselleri, rozet kaldırma, öncelikli işleme.
- Ödeme: TR **iyzico**, global **Stripe/Paddle** (karar M5'te netleşir).

## Faz D — Sipariş sistemi + analitik (v2)
- Misafir menüden **sipariş** verebilir.
- Her restoranın sipariş **veritabanı**; tüm siparişler kaydedilir.
- Bu veriden işletmeye **faydalı değerlendirmeler/analizler** (en çok satan, saat/gün trendi, sepet ortalaması, vb.).
- Aylık/yıllık **abonelik** (bu katman için ayrı ücret).

---

## ⚠️ DEPLOY ANINDA YAPILACAKLAR (ertelendi — Faz B bitince tek seferde)
Karar: uygulama şu an yalnız yerelde çalışıyor (hosting/alan adı yok). Deploy, Faz B tümüyle bitince tek seferde yapılacak. O an aşağıdakiler tamamlanmalı:
- **Hosting:** Vercel'e bağla (GitHub `sapieneo/RestaurantOS` → import). Env değişkenlerini taşı: Supabase URL/anon/service_role, `ANTHROPIC_API_KEY`, `RUNWARE_API_KEY`, `NEXT_PUBLIC_SITE_URL` (canlı adres).
- **`NEXT_PUBLIC_SITE_URL`:** prod'da gerçek alan adı (ör. `https://menu.isletmem.com`, sonda `/` yok). Magic link `emailRedirectTo` ve QR gömülü adresi bundan türüyor.
- **Supabase → Authentication → URL Configuration:** Site URL'i canlı adrese çevir; Redirect URLs'e `https://<alan-adı>/auth/callback` ekle (localhost satırını silme, ikisi birlikte dursun).
- **Supabase → Custom SMTP:** varsayılan e-posta gönderimi sıkı rate-limitli ("email rate limit exceeded" testte görüldü). Gerçek kullanıcı almadan önce kendi SMTP'ni (SendGrid/Resend/SES) tanımla.
- **0009 migration:** `0009_org_contact_phone.sql` prod DB'ye uygulandı mı teyit et (yerelde de bekliyorsa uygula).
- **Google girişi (opsiyonel):** istenirse Google Cloud OAuth client + Supabase Google provider kurulumu; sonra `linkIdentity` butonu eklenecek.

## Açık teknik notlar
- **RLS/oturum doğrulaması:** Anonim kullanıcının `organizations` INSERT'i user-client + RLS ile 42501 verdi; bootstrap provizyonu güvenli şekilde service-role + `created_by = user.id` ile yapılıyor (route kullanıcıyı doğruluyor). User-client RLS **okuma** çalışıyor (taslak görüntülendi). M2 confirm (user RPC) ve approve (user-client yazma) canlıda test edilecek; sorun çıkarsa kritik yazımlar SECURITY DEFINER RPC'ye taşınır.
- **Görsel üretimi maliyeti** (A7/A8) Faz C fiyatlandırmasına bağlanacak.
