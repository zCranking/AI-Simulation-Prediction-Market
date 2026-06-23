import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Move it to the root level of the configuration object
  allowedDevOrigins: ['10.113.109.249'], 
  
  // Your other config options go here
  experimental: {
    // Leave other actual experimental features here, but remove allowedDevOrigins
  },
};

export default nextConfig;
