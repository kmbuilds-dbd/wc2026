import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      "pk_test_c3R1bm5pbmctc3R1ZC0xOC5jbGVyay5hY2NvdW50cy5kZXYk",
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/join",
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/join",
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
