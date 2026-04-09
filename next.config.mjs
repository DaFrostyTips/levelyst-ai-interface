import path from "node:path"
import { fileURLToPath } from "node:url"

/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ""
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig = {
  outputFileTracingRoot: __dirname,
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  transpilePackages: [
    "@levelyst/contracts",
    "@levelyst/dependency-resolver",
    "@levelyst/module-registry",
    "@levelyst/runtime-input",
    "@levelyst/runtime-web-2d",
    "@levelyst/runtime-web-3d",
    "@levelyst/spec-compiler",
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
