import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 允许所有本地和局域网 IP 访问开发环境资源，彻底解决跨域与 HMR 报错
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.*.*'],
};

export default nextConfig;