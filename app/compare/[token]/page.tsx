import CompareClient from "@/components/timetable/compare-client";

export const dynamic = "force-dynamic";

export default function ComparePage({
  params,
}: {
  params: { token: string };
}) {
  return <CompareClient token={params.token} />;
}
