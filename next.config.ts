import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    // Kakao JS key is public by design (protected by registered domains).
    // Registered on Vercel as KAKAO_JS_KEY, exposed to the browser here.
    NEXT_PUBLIC_KAKAO_MAP_KEY:
      process.env.KAKAO_JS_KEY ?? process.env.NEXT_PUBLIC_KAKAO_MAP_KEY,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
