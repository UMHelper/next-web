import React from "react";
import { Frown } from "lucide-react";

import { Masonry } from "@/components/masonry";
import ProfCard from "@/components/prof-card";
import { getProfListByCourse } from "@/lib/database/get-prof-info";

export default async function CourseInstructors({ code }: { code: string }) {
  const profList = await getProfListByCourse(code);

  return (
    <div className='max-w-screen-xl mx-auto p-4'>
      {
        (profList.length == 0 || profList === undefined) ? (
          <div className="flex space-x-1 items-center bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
            <div className='text-xl font-semibold py-4'>No Instructor Found</div>
            <div className="text-indigo-500">
              <Frown size={24} strokeWidth={2} />
            </div>
          </div>

        ) : (
          null
        )
      }
      <Masonry col={3} className={""}>
        {profList.map((data, index) => {
          return (
            <ProfCard key={index} data={data} code={code} />
          )
        })}
      </Masonry>
    </div>
  );
}
