import type { NextConfig } from "next";

const rosterPhotoPatterns = [
  {
    protocol: "https" as const,
    hostname: "www.sfspca.org",
    pathname: "/wp-content/uploads/**",
  },
  {
    protocol: "https" as const,
    hostname: "84e7617cb19add71cb0e.cdn6.editmysite.com",
    pathname: "/uploads/**",
  },
];

function configuredPhotoPattern() {
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim();
  if (publicBase) {
    const url = new URL(publicBase);
    if (url.protocol !== "https:") {
      throw new Error("S3_PUBLIC_BASE_URL must use https so uploaded photos can be optimized safely");
    }
    const basePath = url.pathname.replace(/\/+$/u, "");
    return {
      protocol: "https" as const,
      hostname: url.hostname,
      port: url.port,
      pathname: `${basePath}/**`,
    };
  }

  const bucket = process.env.S3_PHOTO_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim();
  return bucket && region
    ? {
        protocol: "https" as const,
        hostname: `${bucket}.s3.${region}.amazonaws.com`,
        pathname: "/**",
      }
    : null;
}

const configuredPattern = configuredPhotoPattern();

const nextConfig: NextConfig = {
  images: {
    // Without S3, volunteer photos are served from the app itself, with the
    // owning organization in the query string; Next refuses local image
    // sources with a query unless the path is allowed here.
    localPatterns: [
      { pathname: "/api/volunteer-photos/**" },
      { pathname: "/mascot/**" },
    ],
    remotePatterns: configuredPattern
      ? [...rosterPhotoPatterns, configuredPattern]
      : rosterPhotoPatterns,
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
