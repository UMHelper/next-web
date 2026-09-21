import React from "react";
import Link from "next/link";
import { ArrowUpRightSquare } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CourseJsonLd } from "@/components/seo/course-json-ld";
import { getCourseInfo, normalizeLocalCourseInfo } from "@/lib/database/get-course-info";

export default async function CourseHeader({ code }: { code: string }) {
  const localCourse = await getCourseInfo(code);
  const course = normalizeLocalCourseInfo(localCourse, code);
  const isOffer = localCourse["Is_Offered"] === 1;

  return (
    <>
      <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-3'>
        <div className='max-w-screen-xl mx-auto p-4'>
          <div className='flex flex-col md:flex-row justify-between'>
            <div className="py-6">
              <div className="text-sm pb-2">
                <Link href={"/search/course/" + course['courseCode'].substring(0, 4)} className="flex space-x-1">
                  <div>
                    {course['courseCode'].substring(0, 4)}
                  </div>
                  <ArrowUpRightSquare size={12} />
                </Link>
              </div>
              <div className='pb-2 flex-row flex space-x-1'>
                <div className='text-3xl font-bold space-x-1'>
                  <span>
                    <Link href={"/search/course/" + course['courseCode'].substring(0, 4)}>
                      {course['courseCode'].substring(0, 4)}
                    </Link>
                  </span>
                  <span>{course['courseCode'].substring(4)}</span>
                </div>
                {
                  parseInt(course['courseCode'][4]) <= 4 && (isOffer ?
                    <span className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                    : null)
                }
              </div>
              <div className='text-xl font-semibold'>{course["courseTitle"]}</div>
              <div className='text-sm'>{course['offeringProgLevel'] + ' Course, Year ' + parseInt(course['suggestedYearOfStudy'])}</div>
            </div>
            <div className='py-6 space-y-4'>
              <div className='space-y-1'>
                <div className='flex-row flex space-x-4'>
                  <div>
                    <div className='text-xs font-light'>Credits</div>
                    <div className='text-sm'>{course['credits']}</div>
                  </div>
                  <div>
                    <div className='text-xs font-light'>Dept</div>
                    <Link className="flex flex-row" href={`/catalog/${course['offeringUnit']}/${course['offeringDept']}`}>
                      <div className='text-sm'>{course['offeringDept']}</div>
                      <ArrowUpRightSquare size={8} />
                    </Link>
                  </div>
                  <div>
                    <div className='text-xs font-light'>Faculty</div>
                    <Link className="flex flex-row" href={`/catalog/${course['offeringUnit']}`}>
                      <div className='text-sm'>{course['offeringUnit']}</div>
                      <ArrowUpRightSquare size={8} />
                    </Link>
                  </div>
                  <div>
                    <div className='text-xs font-light'>Language</div>
                    <div className='text-sm'>{course['mediumOfInstruction']}</div>
                  </div>
                </div>
                <div className='flex-row flex space-x-4'>
                  <div>
                    <div className='text-xs font-light'>Grading</div>
                    <div className='text-sm'>{course['gradingSystem']}</div>
                  </div>

                  <div>
                    <div className='text-xs font-light'>Course Type</div>
                    <div className='text-sm'>{course['courseType']}</div>
                  </div>
                  <div>
                    <div className='text-xs font-light'>Duration</div>
                    <div className='text-sm'>{course['duration']}</div>
                  </div>
                </div>

              </div>

              <div className='hover:cursor-pointer'>
                <Dialog>
                  <DialogTrigger asChild>
                    <div className='flex flex-row space-x-1'>
                      <div className='text-sm'>
                        Course Description
                      </div>
                      <ArrowUpRightSquare size={12} />
                    </div>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]" >
                    <DialogHeader>
                      <DialogTitle>Course Description</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-sm" style={{
                      maxHeight: '70vh',
                      overflowY: 'scroll'
                    }}>
                      {course['courseDescription']?.replaceAll('\n', '\n') || "No Course Description"}
                    </div>
                    <DialogFooter>
                      <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog>
                  <DialogTrigger asChild>
                    <div className='flex flex-row space-x-1'>
                      <div className='text-sm'>
                        Intended Learning Outcomes
                      </div>
                      <ArrowUpRightSquare size={12} />
                    </div>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Intended Learning Outcomes</DialogTitle>
                    </DialogHeader>
                    <div className="py-4 text-sm"
                      style={{
                        maxHeight: '70vh',
                        overflowY: 'scroll',
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {course['ilo']?.replaceAll('\n', '\n') || "No Intended Learning Outcomes"}
                    </div>
                    <DialogFooter>
                      <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              <div className='text-xs italic'>Data Source: reg.um.edu.mo</div>
            </div>
          </div>
        </div>
      </div>
      <div className='max-w-screen-xl mx-auto p-4'>
        <CourseJsonLd code={course.courseCode} title={course.courseTitle} description={course.courseDescription} />

        <div id="courseSeoContent" className="sr-only">

          <Alert>
            <AlertTitle>Course Description</AlertTitle>
            <AlertDescription>
              {course['courseDescription']?.replaceAll('\n', '\n') || "No Course Description"}
            </AlertDescription>
          </Alert>

          <Alert>
            <AlertTitle>Intended Learning Outcomes</AlertTitle>
            <AlertDescription>
              {course['ilo']?.replaceAll('\n', '\n') || "No Intended Learning Outcomes"}
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </>
  );
}
