import type { NextConfig } from "next"

const isProd = process.env.NODE_ENV === "production"
const repo = "signature"

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
}

export default nextConfig