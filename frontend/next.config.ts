import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // NEEDED: tell Turbopack that the root is the frontend/ directory 
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ];
  },
};

export default nextConfig;
