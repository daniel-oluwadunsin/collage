import type { NextConfig } from "next";

const apiInternalUrl = (
  process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000"
).replace(/\/$/u, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "0a57-105-113-69-231.ngrok-free.app"],
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@collage/ui"],
  rewrites: () =>
    Promise.resolve([
      {
        source: "/api/v1/:path*",
        destination: `${apiInternalUrl}/v1/:path*`,
      },
    ]),
};

export default nextConfig;
