import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable X-Powered-By header to avoid leaking technology stack (SEC-7)
  poweredByHeader: false,
};

export default nextConfig;
