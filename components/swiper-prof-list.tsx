'use client'

import 'swiper/css';
import 'swiper/css/pagination';
import { Drawer, DrawerTrigger, DrawerContent } from "@/components/ui/drawer";
import { Masonry } from "@/components/masonry";
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';

export const SwpierProfList = ({ profList }: { profList: any[] }) => {
    if (profList.length == 0) {
        return null
    }
    return (
        <div>
            <Drawer>
                <DrawerTrigger>
                    <Button className='text-sm px-2 hover:shadow-lg  bg-white text-blue-800 hover:bg-gray-200'>
                        <Users size={16} /> 
                        <span>Other Instructors</span>
                    </Button>
                </DrawerTrigger>
                <DrawerContent>
                    <div className='px-4 pt-2 pb-2' style={{
                        maxHeight: '60vh',
                        overflowY: 'scroll',
                    }}>
                        <Masonry col={3} className={""}>
                            {profList.map((data, index) => {
                                return (
                                    <div key={index}>
                                        {data}
                                    </div>
                                )
                            })}
                        </Masonry>
                    </div>
                </DrawerContent>
            </Drawer>

        </div>
    )
}