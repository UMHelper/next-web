import Toolbar from "@/components/toolbar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowUpRightSquare } from "lucide-react";

export function CourseInfo(course:any,isOffer:boolean){
    return(
        <div className='bg-gradient-to-r from-purple-400 to-rose-500 text-white p-4'>
                <div className='max-w-screen-xl mx-auto p-4'>
                        <div className='flex flex-col md:flex-row justify-between'>
                            <div>
                                <div className='md:pb-2 flex-row flex space-x-1'>
                                    <div className='text-3xl font-bold'>{course['courseCode']}</div>
                                    {
                                        isOffer?
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                            :
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                    }
                                </div>
                                <div className='text-xl font-semibold'>{course["courseTitle"]}</div>
                                <div className='text-sm'>{course['offeringProgLevel']+' Course, Year '+course['suggestedYearOfStudy']}</div>
                                <Toolbar course={course} prof={undefined}/>
                            </div>
                            <div className='space-y-4'>
                                <div className='space-y-1'>
                                    <div className='flex-row flex space-x-4'>
                                        <div>
                                            <div className='text-xs font-light'>Credits</div>
                                            <div className='text-sm'>{course['credits']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Dept</div>
                                            <div className='text-sm'>{course['offeringDept']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Faculty</div>
                                            <div className='text-sm'>{course['offeringUnit']}</div>
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
                                                <ArrowUpRightSquare size={12}/>
                                            </div>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Course Description</DialogTitle>
                                            </DialogHeader>
                                            <div className="py-4 text-sm">
                                                {course['courseDescription']}
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
                                                <ArrowUpRightSquare size={12}/>
                                            </div>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Course Description</DialogTitle>
                                            </DialogHeader>
                                            <div className="py-4 text-sm">
                                                {course['ilo']}
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
    )
}