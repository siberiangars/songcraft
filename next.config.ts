import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn1.suno.ai" },
      { protocol: "https", hostname: "cdn2.suno.ai" },
      { protocol: "https", hostname: "*.sunoapi.org" },
    ],
  },

  serverExternalPackages: ["grammy", "bullmq", "ioredis", "winston"],

  // Required headers for Telegram Mini App
  async headers() {
    return [
      {
        source: "/songcraft/:path*",
        headers: [
          // Allow Telegram to embed the page
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          // Allow all origins for Mini App resources
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
