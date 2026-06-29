/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
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
