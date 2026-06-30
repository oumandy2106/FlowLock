/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    // sodium-native and require-addon are Node.js native modules that cannot
    // be bundled for the browser — exclude them entirely from the client bundle
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      "sodium-native",
      "require-addon",
    ];

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        "node:buffer": false,
        "node:crypto": false,
        "node:stream": false,
        "node:util": false,
      };
    }
    return config;
  },
};

export default nextConfig;
