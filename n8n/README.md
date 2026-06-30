# n8n WhatsApp Outreach Kurulumu

## Genel bakış

Bu workflow her Pazartesi 09:00'da otomatik çalışır:
1. RestaurantOS API'den "henüz başvurmamış" lead'leri çeker
2. 30 günden az kalan işletmeleri filtreler
3. Kişiselleştirilmiş deadline mesajı oluşturur
4. WhatsApp (Meta API) **veya** SMS (Netgsm) ile gönderir
5. CRM'de "contacted" olarak işaretler

## Kurulum

### 1. n8n başlat

```bash
# Docker ile (önerilen)
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=güçlü_şifre \
  n8nio/n8n

# http://localhost:5678
```

### 2. Workflow'u import et

n8n arayüzü → **Workflows** → **Import from File** → `whatsapp-outreach.json`

### 3. Environment Variables (n8n Settings → Variables)

| Değişken | Açıklama |
|----------|----------|
| `RESTAURANTOS_API_URL` | `https://restaurantos.app` |
| `NETGSM_USERCODE` | Netgsm kullanıcı kodu |
| `NETGSM_PASSWORD` | Netgsm şifre |
| `NETGSM_MSGHEADER` | `RESTAURANTOS` |
| `WHATSAPP_TOKEN` | Meta Business API token (opsiyonel) |
| `WHATSAPP_PHONE_ID` | WhatsApp Business Phone ID (opsiyonel) |

### 4. HTTP Auth credential

n8n → **Credentials** → **Add Credential** → **HTTP Header Auth**
- Name: `RestaurantOS API`
- Header Name: `Authorization`
- Header Value: `Bearer YOUR_API_KEY`

## Mesaj örnekleri

**7 günden az kalan:**
```
⚠️ ACİL Sayın Ahmet Bey,

Boğaz Mangal için 1 Temmuz 2026 gıda etiketleme yönetmeliği son tarihi yaklaşıyor. *6 gün kaldı.*

Menünüzdeki 14 alerjen ve kalori bilgilerini RestaurantOS ile 15 dakikada tamamlayın.

📲 Hemen başla: https://restaurantos.app/studyo
```

**14-30 gün arası:**
```
⏰ Sayın İşletme Sahibi,

Kafe Deniz için 1 Temmuz 2026 gıda etiketleme yönetmeliği son tarihi yaklaşıyor. *23 gün kaldı.*
...
```

## Lead API Endpoint'leri

RestaurantOS backend'inde şu endpoint'leri ekleyin:

- `GET /api/leads/pending` — henüz tamamlamamış işletmeleri döner
- `POST /api/leads/mark-contacted` — `{ phone, channel }` ile günceller

Bu endpoint'ler için Supabase'deki `analytics_events` ve `restaurants` tablolarını kullanabilirsiniz.

## WhatsApp Business API (Meta)

1. [developers.facebook.com](https://developers.facebook.com) → App oluştur → WhatsApp seç
2. Business Verification tamamla
3. Phone Number ekle → Token al
4. İlk 24 saatte şablon dışı mesaj gönderebilirsiniz;
   sonrasında Meta onaylı şablon zorunluluğu var.

**Şablon başvurusu için örnek:**
```
Sayın {{1}},
{{2}} için yönetmelik tarihi {{3}} gün sonra. RestaurantOS ile hemen uyum sağlayın: {{4}}
```
