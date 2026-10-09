import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The production image copies `.next/standalone` and runs it with plain node,
  // so the container carries the server and the few dependencies it actually
  // imports instead of the whole node_modules tree. Without this the image is
  // about 1 GB and the VPS the proposal prices cannot build it.
  output: "standalone",

  // Pinned because there is a package-lock.json further up the user's home
  // directory; without this Turbopack walks up to it, decides the workspace root
  // is /Users/<name>, and warns on every build.
  turbopack: { root: __dirname },

  // Uploaded logos and photographs come from the Django host, whose address is an
  // environment variable — so it cannot be an `images.remotePatterns` entry fixed
  // at build time. Those few images use a plain <img>; everything bundled with the
  // app still goes through next/image.
  images: { remotePatterns: [] },

  // A build must not pass with type errors in it. Next's default is already this;
  // stated so nobody "fixes" a red build by turning it off. (Next 16 dropped the
  // matching `eslint` key — lint runs as its own `npm run lint` step.)
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
