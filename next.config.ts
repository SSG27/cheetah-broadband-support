import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
