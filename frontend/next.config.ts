import type { NextConfig } from 'next';

/**
 * Two deployment modes:
 *  1. NEXT_PUBLIC_API_URL set (e.g. http://localhost:5000) – the browser calls the API directly.
 *  2. NEXT_PUBLIC_API_URL empty and BACKEND_URL set – the browser calls /api on this origin and
 *     Next.js proxies to the backend. Cookies are then first-party, which avoids third-party
 *     cookie blocking when frontend and backend live on different domains.
 */
const backend = process.env.BACKEND_URL?.replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't generate an AGENTS.md file in the project on `next dev`.
  agentRules: false,
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    if (process.env.NEXT_PUBLIC_API_URL || !backend) return [];
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
