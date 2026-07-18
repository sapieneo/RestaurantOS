import PDFDocument from 'pdfkit';
import path from 'node:path';

const FONT_DIR = path.join(process.cwd(), 'src', 'server', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

export type QrCardInput = {
  qrPng: Buffer;
  venueName: string;
  label: string | null;
  url: string;
};

/**
 * Masaya konacak QR kartı (A6, dikey). Kesim payı için kenarlarda kesik
 * çizgi çerçeve var. Türkçe karakterler için DejaVu gömülüdür.
 */
export function buildQrCardPdf(input: QrCardInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A6', layout: 'portrait', margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('body', FONT_REGULAR);
    doc.registerFont('bold', FONT_BOLD);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const usable = right - left;

    // Kesim çerçevesi
    doc
      .save()
      .dash(3, { space: 3 })
      .lineWidth(0.5)
      .strokeColor('#cccccc')
      .rect(left - 10, doc.page.margins.top - 10, usable + 20, doc.page.height - doc.page.margins.top * 2 + 20)
      .stroke()
      .undash()
      .restore();

    let y = doc.page.margins.top + 6;

    doc.font('bold').fontSize(15).fillColor('#111');
    doc.text(input.venueName, left, y, { width: usable, align: 'center' });
    y = doc.y + 2;

    if (input.label) {
      doc.font('body').fontSize(10).fillColor('#777');
      doc.text(input.label, left, y, { width: usable, align: 'center' });
      y = doc.y;
    }

    y += 10;
    const qrSize = Math.min(usable, doc.page.height - y - 78);
    const qrX = left + (usable - qrSize) / 2;
    doc.image(input.qrPng, qrX, y, { width: qrSize, height: qrSize });
    y += qrSize + 12;

    doc.font('bold').fontSize(11).fillColor('#111');
    doc.text('Menü için QR kodu okutun', left, y, { width: usable, align: 'center' });
    y = doc.y + 4;

    doc.font('body').fontSize(7.5).fillColor('#999');
    doc.text(input.url, left, y, { width: usable, align: 'center' });

    doc
      .font('body')
      .fontSize(6.5)
      .fillColor('#bbb')
      .text(
        'RestaurantOS',
        left,
        doc.page.height - doc.page.margins.bottom - 8,
        { width: usable, align: 'center' }
      );

    doc.end();
  });
}
