import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"
const repo = "signature"

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  trailingSlash: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
}

export default nextConfig