import type { Metadata } from "next";

import {
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_URL,
  IOS_APP_ID,
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
  /**
   * iOS Safari 頂部的系統橫幅（Smart App Banner）：渲染成
   * `<meta name="apple-itunes-app" content="app-id=6804686377">`。
   *
   * 這是先前「App 未上架」時刪掉的那個佔位 meta 的正身 —— App 已上架，因此重新
   * 掛上。橫幅只在 iOS Safari 出現，且需要 `content` 裡只有 app-id（`appArgument`
   * 是 universal link 用的當前頁 URL，靜態 rootMetadata 給不出來，留空）。
   */
  itunes: {
    appId: IOS_APP_ID,
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
