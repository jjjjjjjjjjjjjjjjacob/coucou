import type { NextConfig } from "next";

const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@coucou/sdk", "@coucou/ui"],
  turbopack: {
    // Empty config to acknowledge Turbopack is enabled by default in Next.js 16
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.convex.dev",
      },
      {
        protocol: "https",
        hostname: "**.convex.cloud",
      },
    ],
  },
  typescript: {
    tsconfigPath: "./tsconfig.build.json",
  },
  async redirects() {
    return [
      {
        source: "/admin",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard`,
        permanent: false,
      },
      {
        source: "/admin/:path*",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard/:path*`,
        permanent: false,
      },
      {
        source: "/host",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard`,
        permanent: false,
      },
      {
        source: "/host/:path*",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard/:path*`,
        permanent: false,
      },
      {
        source: "/door",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard/door`,
        permanent: false,
      },
      {
        source: "/door/:path*",
        destination: `${coucouBaseUrl}/workspaces/dojo/dashboard/door/:path*`,
        permanent: false,
      },
    ];
  },
  webpack: (config, { dev }) => {
    // Exclude test files from webpack bundling
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];

    config.module.rules.push({
      test: /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      use: "ignore-loader",
    });

    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions ?? {}),
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          "**/.git/**",
          "**/.hg/**",
          "**/.svn/**",
          "**/.DS_Store",
          "**/.next/**",
          "**/dist/**",
          "**/build/**",
          "**/coverage/**",
          "**/node_modules/**",
          "**/bun.lock",
          "**/package-lock.json",
          "**/yarn.lock",
          "**/pnpm-lock.yaml",
          "**/convex/.deploy/**",
          "**/__tests__/**",
          "**/test-setup.ts",
        ],
      } as any;
    }
    return config;
  },
};

export default nextConfig;
