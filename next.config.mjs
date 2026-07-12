/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  // PDF uyum raporu, TTF fontları çalışma anında fs ile okur; serverless
  // bundle'ına dahil edilmeleri için izlenecek dosyalara eklenir.
  experimental: {
    outputFileTracingIncludes: {
      '/api/compliance/report': ['./src/server/fonts/**'],
    },
  },
};
export default nextConfig;
