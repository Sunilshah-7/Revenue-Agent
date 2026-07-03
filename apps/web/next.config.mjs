// Minimal Next.js config. typedRoutes generates literal types for
// `href` props (e.g. Link href="/dashboard") so typos in internal routes
// are caught at compile time; no other custom build behavior is defined.
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
