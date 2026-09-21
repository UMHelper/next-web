import React from "react";
import Link from "next/link";
import { CalendarRange, ChevronRightCircle, ClipboardEdit } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { TimetableScheduleCard } from "@/components/timetable-schedule-card";
import { getAppConfig } from "@/lib/config/app-config";
import { shouldShowOfferedBadge } from "@/lib/config/offered-badge";
import { getCourseInfo } from "@/lib/database/get-course-info";
import getScheduleList from "@/lib/database/get-schedule-list";
import type { ProfWithCourseRow } from "@/lib/database/types";

export async function ReviewHeader({
  code,
  prof,
  profInfo,
}: {
  code: string;
  prof: string;
  profInfo: ProfWithCourseRow;
}) {
  const is_offered = profInfo.is_offered;

  const [course_info, { isPreenrollmentOpen }, timetable] = await Promise.all([
    getCourseInfo(code),
    getAppConfig(),
    is_offered ? getScheduleList(code, prof) : Promise.resolve([]),
  ]);

  return (
    <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-6'>
      <div className='max-w-screen-xl mx-auto p-4'>
        <div className='flex flex-col md:flex-row justify-between'>
          <div className="py-3">
            <div>
              <Link href={"/search/course/" + String(course_info['New_code']).substring(0, 4)} className="flex space-x-1 items-center">
                <div className='text-sm'>{String(course_info['New_code']).substring(0, 4)}</div>
                <ChevronRightCircle size={14} strokeWidth={1.5} />
              </Link>
            </div>
            <div className='font-bold text-xl'>
              <Link href={"/course/" + course_info['New_code']} className="flex space-x-1 items-center">
                <h2>
                  {course_info['New_code']}
                </h2>
                <ChevronRightCircle size={14} strokeWidth={1.5} />
              </Link>
            </div>
            <div className='text-base'>{course_info["courseTitleEng"]}</div>
            <div className='text-sm'>{course_info["courseTitleChi"]}</div>
            <div className='pb-3 flex-row flex space-x-2 mt-4'>
              <Link className="flex space-x-2" href={'/professor/' + profInfo.prof_id}>
                <div className='font-bold text-3xl break-all'>{profInfo['prof_id']}</div>
              </Link>
              {shouldShowOfferedBadge(isPreenrollmentOpen, is_offered) ? (
                <span className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
              ) : null}
            </div>
            <div className='flex-row flex space-x-2'>
              <Link href={`/submit/${encodeURIComponent(code)}/${encodeURIComponent(prof)}`}>
                <Button className='text-sm px-2 hover:shadow-lg bg-white text-blue-800 hover:bg-gray-200'>
                  <ClipboardEdit size={16} /><span> Submit Review</span>
                </Button>
              </Link>

              {
                is_offered ?
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button className='text-sm px-2 hover:shadow-lg  bg-white text-blue-800 hover:bg-gray-200'>
                        <CalendarRange size={16} /> <span>Timetable</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <TimetableScheduleCard
                        timetable={timetable}
                        code={code}
                        prof={prof}
                        courseTitle={course_info["courseTitleEng"]}
                        credits={Number(course_info["Credits"])}
                      />
                    </PopoverContent>
                  </Popover>
                  :
                  <></>
              }
            </div>
          </div>
          <Card className='md:w-80 py-4 pb-0 md:m-0 mt-8'>
            <CardContent className="h-full py-4">
              <div className='space-y-2 flex flex-col h-full justify-between'>
                <div className='space-y-2 text-sm'>
                  <div>
                    總體 Overall
                  </div>
                  <Progress value={Number(profInfo['result']) * 20} className='h-2' />
                </div>
                <div className='space-y-2 text-sm'>
                  <div>
                    成績 Grade
                  </div>
                  <Progress value={Number(profInfo['grade']) * 20} className='h-2' />
                </div>
                <div className='space-y-2 text-sm'>
                  <div>
                    難度 Difficulty
                  </div>
                  <Progress value={Number(profInfo['hard']) * 20} className='h-2' />
                </div>
                <div className='space-y-2 text-sm'>
                  <div>
                    實用性 Usefulness
                  </div>
                  <Progress value={Number(profInfo['reward']) * 20} className='h-2' />
                </div>
                <p className='text-xs italic text-gray-500'>Based on the reviews from users.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
