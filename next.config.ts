import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "tesseract.js"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } }
};
export default nextConfig;
