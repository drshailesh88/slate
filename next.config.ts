import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The floating dev-tools badge overlaps the sidebar account block and the
  // mobile tab bar; errors still surface with the indicator hidden.
  devIndicators: false,
};

export default nextConfig;
