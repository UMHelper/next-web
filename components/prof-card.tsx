import Link from "next/link";

import { RatingStatsCard } from "@/components/course/rating-stats-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function OfferedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal">
      {children}
    </span>
  );
}

const ProfCard = async ({ data, code }: { data: any; code: any }) => {
  return (
    <Link href={"/reviews/" + code + "/" + data.prof_id}>
      <Card className="hover:cursor-pointer hover:shadow-lg">
        <CardHeader className="pb-0.5">
          <div className="flex flex-row justify-between">
            <div className="break-words">{data.prof_id}</div>
            <div className="text-white flex flex-col">
              {parseInt(code[4]) <= 4 &&
                Number(process.env.IS_PREENROLLMENT_OPEN) == 0 &&
                data.is_offered && <OfferedBadge>Offered</OfferedBadge>}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RatingStatsCard stats={data} />
        </CardContent>
      </Card>
    </Link>
  );
};

export const ProfCourseCard = async ({ data, code }: { data: any; code: any }) => {
  return (
    <Link href={"/reviews/" + code + "/" + data.prof_id}>
      <Card className="hover:cursor-pointer hover:shadow-lg">
        <CardHeader className="pb-0.5">
          <div className="flex flex-row justify-between">
            <div className="break-words">{data.course_id}</div>
            <div className="text-white flex flex-col">
              {parseInt(code[4]) <= 4 &&
                (data.is_offered ? (
                  <OfferedBadge>Offered</OfferedBadge>
                ) : (
                  <div className="text-xs font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow">
                    Not Offered
                  </div>
                ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RatingStatsCard
            stats={data}
            labels={{ hard: "Easy", reward: "Outcome" }}
          />
        </CardContent>
      </Card>
    </Link>
  );
};

export default ProfCard;
