import path from "node:path";
import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.DEV_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  images: { unoptimized: true },
  transpilePackages: ["@lgs/api"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
