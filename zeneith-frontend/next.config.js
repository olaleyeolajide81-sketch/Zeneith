/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Noir WASM prover
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    return config;
  },
};

module.exports = nextConfig;
