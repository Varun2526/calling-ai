/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship raw TS/TSX; Next must transpile them.
  transpilePackages: ['@propulse/ui', '@propulse/contracts'],
};

export default nextConfig;
