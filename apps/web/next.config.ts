import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@remote-ide/ui", "@remote-ide/shared"],
};

export default nextConfig;
