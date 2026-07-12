import PDFDocument from 'pdfkit';
import path from 'node:path';
import { ALLERGENS, type AllergenCode } from '@/lib/allergens';
import { ALLERGEN_CODES } from '@/lib/schemas/menu';

const FONT_DIR = path.join(process.cwd(), 'src', 'server', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

export type ReportItem = {
  name: string;
  category: string;
  calories: number | null;
  confirmed: boolean;
  allergenCodes: string[]; // confirmed alerjenler
  reviewedAt: string | null;
  reviewerEmail: string | null;
};

export type ReportData = {
  venueName: string;
  items: ReportItem[];
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Uyum raporunu PDF buffer olarak üretir (A4 yatay). */
export function buildCompliancePdf(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('body', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const usable = right - left;
    const now = new Date().toLocaleString('tr-TR');

    const confirmedItems = data.items.filter((i) => i.confirmed);

    // --- Başlık ---
    doc.font('bold').fontSize(18).fillColor('#111').text('UYUM RAPORU', left, doc.page.margins.top);
    doc.font('body').fontSize(11).fillColor('#333').text(data.venueName, { continued: false });
    doc.fontSize(8).fillColor('#666').text(
      `Oluşturulma: ${now}  ·  ${confirmedItems.length}/${data.items.length} ürün onaylı  ·  ` +
        'Kaynak: T.C. Tarım ve Orman Bakanlığı — menüde 14 alerjen + kalori beyanı'
    );
    doc.moveDown(0.5);

    // --- Matris için mevcut alerjen sütunları (onaylı ürünlerdeki birleşim) ---
    const present: AllergenCode[] = ALLERGEN_CODES.filter((code) =>
      confirmedItems.some((it) => it.allergenCodes.includes(code))
    );

    doc.font('bold').fontSize(11).fillColor('#111').text('1) Ürün × Alerjen Matrisi');
    doc.moveDown(0.3);

    const nameW = 190;
    const statusW = 66;
    const dateW = 96;
    const algArea = usable - nameW - statusW - dateW;
    const colW = present.length ? Math.min(30, algArea / present.length) : 0;
    const rowH = 16;

    const drawHeader = () => {
      const y = doc.y;
      doc.font('bold').fontSize(7).fillColor('#111');
      doc.text('Ürün', left + 2, y + 4, { width: nameW - 4 });
      let x = left + nameW;
      for (const code of present) {
        doc.text(ALLERGENS[code].abbr, x, y + 4, { width: colW, align: 'center' });
        x += colW;
      }
      doc.text('Durum', x, y + 4, { width: statusW, align: 'center' });
      doc.text('Onay tarihi', x + statusW, y + 4, { width: dateW, align: 'center' });
      doc
        .moveTo(left, y + rowH)
        .lineTo(right, y + rowH)
        .lineWidth(0.8)
        .strokeColor('#999')
        .stroke();
      doc.y = y + rowH + 2;
    };

    const pageBottom = doc.page.height - doc.page.margins.bottom - 30;

    drawHeader();
    for (const it of data.items) {
      if (doc.y + rowH > pageBottom) {
        doc.addPage();
        drawHeader();
      }
      const y = doc.y;
      doc.font('body').fontSize(7.5).fillColor('#222');
      doc.text(it.name, left + 2, y + 3, { width: nameW - 4, ellipsis: true, lineBreak: false });
      let x = left + nameW;
      for (const code of present) {
        const has = it.confirmed && it.allergenCodes.includes(code);
        doc
          .font(has ? 'bold' : 'body')
          .fillColor(has ? '#b91c1c' : '#ccc')
          .text(has ? '✓' : '·', x, y + 3, { width: colW, align: 'center' });
        x += colW;
      }
      doc
        .font('body')
        .fillColor(it.confirmed ? '#047857' : '#b45309')
        .text(it.confirmed ? 'Onaylı' : 'İncelenmedi', x, y + 3, { width: statusW, align: 'center' });
      doc.fillColor('#555').text(fmtDate(it.reviewedAt), x + statusW, y + 3, {
        width: dateW,
        align: 'center',
      });
      doc
        .moveTo(left, y + rowH)
        .lineTo(right, y + rowH)
        .lineWidth(0.4)
        .strokeColor('#eee')
        .stroke();
      doc.y = y + rowH;
    }

    if (!present.length) {
      doc.font('body').fontSize(9).fillColor('#b45309').text('Henüz onaylı alerjen bulunmuyor.');
    }

    // --- Onay zinciri ---
    doc.moveDown(1);
    if (doc.y + 40 > pageBottom) doc.addPage();
    doc.font('bold').fontSize(11).fillColor('#111').text('2) Onay Zinciri');
    doc.moveDown(0.3);
    doc.font('body').fontSize(8).fillColor('#333');
    if (!confirmedItems.length) {
      doc.text('Henüz onaylanmış ürün yok.');
    } else {
      for (const it of confirmedItems) {
        if (doc.y + 14 > pageBottom) doc.addPage();
        const alg = it.allergenCodes.length
          ? it.allergenCodes.map((c) => ALLERGENS[c as AllergenCode]?.tr ?? c).join(', ')
          : 'Alerjensiz beyanı';
        doc
          .font('bold')
          .fillColor('#111')
          .text(it.name, { continued: true })
          .font('body')
          .fillColor('#444')
          .text(
            `  —  ${alg}  ·  Onaylayan: ${it.reviewerEmail ?? '—'}  ·  ${fmtDate(it.reviewedAt)}`
          );
      }
    }

    // --- Alt not ---
    doc.moveDown(1.5);
    doc
      .font('body')
      .fontSize(7)
      .fillColor('#888')
      .text(
        'İlke: Yapay zeka önerir, işletme onaylar. Bu rapor yalnızca işletmenin onayladığı beyanları içerir. ' +
          'Alerjen bilgisi işletme sorumluluğundadır; RestaurantOS içerik doğruluğunu garanti etmez.',
        left,
        doc.page.height - doc.page.margins.bottom - 20,
        { width: usable }
      );

    doc.end();
  });
}
