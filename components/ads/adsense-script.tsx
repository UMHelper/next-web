import Script from "next/script";

import { getAdsenseClientId, shouldSelfHostAdsenseLoader } from "@/lib/ads/ad-config";

export function AdsenseScript() {
  const client = getAdsenseClientId();
  if (!client || !shouldSelfHostAdsenseLoader()) return null;

  return (
    <Script
      id="adsense-loader"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  );
}

export default AdsenseScript;
