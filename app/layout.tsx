import type { Metadata } from 'next'
import { Inter, Sora } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const sora = Sora({ subsets: ['latin'], variable: '--font-sora' })

export const metadata: Metadata = {
  title: { default: 'RestaurantOS', template: '%s | RestaurantOS' },
  description: '3 dakikada yasal uyumlu menü. AI destekli ürün veri yönetimi.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'https://restaurantos.com'),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${sora.variable}`}>
      <body className="font-sans bg-gray-50 text-gray-900 antialiased">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: { background: '#0D1B2A', color: '#fff', border: '1px solid #1E3A52' },
            success: { iconTheme: { primary: '#14B8A6', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#F97316', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
