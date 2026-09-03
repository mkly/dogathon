import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:orgSlug/dogs/:id",
        destination: "/:orgSlug/companions/:id",
        permanent: true,
      },
      {
        source: "/:orgSlug/admin/dogs-covered",
        destination: "/:orgSlug/admin/companions-covered",
        permanent: true,
      },
    ];
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
