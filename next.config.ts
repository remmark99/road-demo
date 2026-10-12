import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // gzip для JSON/HTML от самого Next (карта и дороги — сотни КБ).
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;
