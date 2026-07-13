/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  experimental: {
    // pdfkit'i webpack ile paketleme; node_modules'tan çalışma anında yüklensin
    // (aksi halde kendi .afm font veri dosyalarını bulamayıp 500 verir).
    serverComponentsExternalPackages: ['pdfkit'],
    // PDF uyum raporu, TTF fontları çalışma anında fs ile okur; serverless
    // bundle'ına dahil edilmeleri için izlenecek dosyalara eklenir.
    outputFileTracingIncludes: {
      '/api/compliance/report': ['./src/server/fonts/**'],
    },
  },
};
export default nextConfig;
