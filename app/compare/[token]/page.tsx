import { auth } from "@clerk/nextjs/server";

import CompareClient from "@/components/timetable/compare-client";

export const dynamic = "force-dynamic";

type ComparePageProps = {
  params: Promise<{ token: string }>;
};

export default async function ComparePage({ params }: ComparePageProps) {
  // The old authMiddleware publicRoutes deliberately excluded /compare, so this
  // page must keep its own resource-level guard now that middleware only injects
  // Clerk request state.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const { token } = await params;
  return <CompareClient token={token} />;
}
