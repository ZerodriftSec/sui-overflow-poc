/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flagcdn.com', pathname: '/**' },
    ],
  },
  webpack: (config) => {
    // wagmi/connectors barrel export references optional peer deps
    // that we don't use (porto, safe, walletconnect). Mark them as
    // external so webpack doesn't fail trying to resolve them.
    config.resolve.alias = {
      ...config.resolve.alias,
      // wagmi v3 optional tempo connector — not used in merchant dashboard
      accounts: false,
      '@metamask/connect-evm': false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@metamask/connect-evm': false,
      'porto': false,
      'porto/internal': false,
      '@safe-global/safe-apps-sdk': false,
      '@safe-global/safe-apps-provider': false,
      '@react-native-async-storage/async-storage': false,
      'pino-pretty': false,
    };
    return config;
  },
};

export default nextConfig;
