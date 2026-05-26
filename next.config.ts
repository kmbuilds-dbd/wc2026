import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      "pk_live_Y2xlcmsuZm9sbG93YnVpbGRlcnMud29ya2Vycy5kZXYk",
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/join",
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: "/join",
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
