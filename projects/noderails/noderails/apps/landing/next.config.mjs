/** @type {import('next').NextConfig} */
const nextConfig = {
	images: {
		remotePatterns: [
			{ protocol: 'https', hostname: 'flagcdn.com', pathname: '/**' },
			{ protocol: 'https', hostname: 'cdn.jsdelivr.net', pathname: '/**' },
			{ protocol: 'https', hostname: 'cryptologos.cc', pathname: '/**' },
		],
	},
	async redirects() {
		return [
			{
				source: '/:path*',
				has: [{ type: 'host', value: 'noderails.com' }],
				destination: 'https://www.noderails.com/:path*',
				permanent: true,
			},
		];
	},
};

export default nextConfig;
