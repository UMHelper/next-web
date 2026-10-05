import CompareClient from "@/components/timetable/compare-client";

export const dynamic = "force-dynamic";

type ComparePageProps = {
  params: Promise<{ token: string }>;
};

export default async function ComparePage({ params }: ComparePageProps) {
  const { token } = await params;
  return <CompareClient token={token} />;
}
