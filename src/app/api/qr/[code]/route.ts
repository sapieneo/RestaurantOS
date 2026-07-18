import { NextResponse, type NextRequest } from 'next/server';
import QRCode from 'qrcode';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { siteOrigin, qrTargetUrl } from '@/lib/qr';
import { buildQrCardPdf } from '@/server/qr-pdf';

export const runtime = 'nodejs';

/**
 * GET /api/qr/{code}?format=png|pdf
 * Basıma hazır QR çıktısı üretir. Yalnız org üyesi indirebilir — kodun kendisi
 * herkese açık olsa da (masadaki etikette yazıyor) materyal üretimi işletmeye ait.
 */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = params.code.toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(code)) {
    return NextResponse.json({ error: 'Geçersiz kod.' }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('qr_codes')
    .select('id, org_id, label, venues(name)')
    .eq('code', code)
    .maybeSingle();
  const qr = data as { id: string; org_id: string; label: string | null; venues: { name: string } | null } | null;
  if (!qr) return NextResponse.json({ error: 'QR kodu bulunamadı.' }, { status: 404 });

  // Üyelik denetimi user-client + RLS ile: üye değilse satır dönmez.
  const { data: membership } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('org_id', qr.org_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Yetkin yok.' }, { status: 403 });

  const url = qrTargetUrl(siteOrigin(request), code);
  const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'png';
  const venueName = qr.venues?.name ?? 'İşletme';
  const fileBase = `qr-${code}${qr.label ? `-${slugifyForFile(qr.label)}` : ''}`;

  if (format === 'png') {
    const png = await QRCode.toBuffer(url, {
      type: 'png',
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111111ff', light: '#ffffffff' },
    });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${fileBase}.png"`,
        'Cache-Control': 'private, no-store',
      },
    });
  }

  // PDF: baskıya uygun masa kartı (QR + işletme adı + etiket).
  const qrPng = await QRCode.toBuffer(url, {
    type: 'png',
    width: 900,
    margin: 0,
    errorCorrectionLevel: 'M',
  });
  const pdf = await buildQrCardPdf({ qrPng, venueName, label: qr.label, url });
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileBase}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

function slugifyForFile(s: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o',
    ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return s
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
