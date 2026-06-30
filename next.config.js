/** @type {import('next').NextConfig} */
const nextConfig = {
  // Node.js runtime — iyzico + Google Vision uyumluluğu için
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/vision', 'iyzipay'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Vercel deployment
  output: 'standalone',
}

module.exports = nextConfig
