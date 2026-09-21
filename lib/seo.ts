import type { Metadata } from "next";

import {
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_URL,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
} from "@/lib/site";

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

export function buildProfessorMetadata(name: string): Metadata {
  const title = `${name} 課程評價`;
  return {
    title,
    alternates: { canonical: buildProfessorPath(name) },
    openGraph: { title },
  };
}

export function buildCourseMetadata({
  code,
  title,
  offeringUnit,
  offeringDept,
  description,
}: {
  code: string;
  title: string;
  offeringUnit?: string;
  offeringDept?: string;
  description?: string | null;
}): Metadata {
  const metadataTitle = `${code} · ${title}`;
  const metadataDescription =
    [title, offeringUnit, offeringDept].filter(Boolean).join("・") +
    "｜University of Macau course review.";
  return {
    title: metadataTitle,
    description: description?.slice(0, 160) || metadataDescription,
    alternates: { canonical: buildCoursePath(code) },
    openGraph: { title: metadataTitle, description: metadataDescription },
  };
}

export function buildReviewMetadata({
  code,
  prof,
}: {
  code: string;
  prof: string;
}): Metadata {
  const title = `${prof} | ${code} 評價`;
  return {
    title,
    alternates: {
      canonical: buildReviewPath(code, prof),
    },
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false },
};

export const noIndexFollowMetadata: Metadata = {
  robots: { index: false, follow: true },
};
