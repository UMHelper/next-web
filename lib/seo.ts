import type { Metadata } from "next";

import { SITE_NAME, SITE_SHORT_NAME, SITE_URL } from "@/lib/site";

const DEFAULT_DESCRIPTION =
  "University of Macau course review platform / 澳大選咩課。";

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_SHORT_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_SHORT_NAME,
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: "/images/hero-1280.jpg", width: 1280, height: 960, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    images: ["/images/hero-1280.jpg"],
  },
  alternates: {
    canonical: "/",
  },
};
