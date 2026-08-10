/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@streamline/sdk"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
  },
  webpack: (config) => {
    // snarkjs / circomlibjs reference Node built-ins that don't exist in the
    // browser; stub them so the client bundle builds. Confidential proving runs
    // client-side via dynamic import.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      readline: false,
      crypto: false,
      path: false,
      os: false,
    };
    return config;
  },
};

export default nextConfig;
