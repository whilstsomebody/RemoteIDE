import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // apps/web/Dockerfile copies .next/standalone and runs apps/web/server.js, which requires
  // standalone output traced from the monorepo root.
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@remote-ide/ui", "@remote-ide/shared"],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        url: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;
