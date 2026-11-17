import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Forzamos a desactivar Turbopack para evitar el error de node:fs en Vercel
  turbopack: {},
};

export default nextConfig;