import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
