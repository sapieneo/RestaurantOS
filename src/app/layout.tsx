import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RestaurantOS — Menünü dakikalar içinde dijitale taşı',
  description:
    'Menü fotoğrafını yükle; yapay zeka çıkarsın, sen onayla. Alerjen ve kalori uyumlu, çok dilli QR menü.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
