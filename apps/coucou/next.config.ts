import type { NextConfig } from "next";

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
        source: "/workspaces/:workspaceSlug/host",
        destination: "/workspaces/:workspaceSlug/dashboard",
        permanent: false,
      },
      {
        source: "/workspaces/:workspaceSlug/host/:path*",
        destination: "/workspaces/:workspaceSlug/dashboard/:path*",
        permanent: false,
      },
      {
        source: "/workspaces/:workspaceSlug/door",
        destination: "/workspaces/:workspaceSlug/dashboard/door",
        permanent: false,
      },
      {
        source: "/workspaces/:workspaceSlug/door/:path*",
        destination: "/workspaces/:workspaceSlug/dashboard/door/:path*",
        permanent: false,
      },
      {
        source: "/host/:path*",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/door/:path*",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/events/:path*",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/redeem/:path*",
        destination: "/admin",
        permanent: false,
      },
      {
        source: "/tickets",
        destination: "/admin",
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
      } as NonNullable<typeof config.watchOptions>;
    }
    return config;
  },
};

export default nextConfig;
