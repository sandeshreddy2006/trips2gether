import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // NEEDED: tell Turbopack that the root is the frontend/ directory 
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
