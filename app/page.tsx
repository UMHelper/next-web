'use client'

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { z } from "zod";
import { set, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { CircleDollarSign, Microscope, Newspaper, BookMarked, Scale, School, Search, Bot, Star, Radar, Github } from "lucide-react";
import { useRouter } from "next/navigation";
import crypto from 'crypto';
import https from 'https';
import axios from 'axios';

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
    is_prof: z.boolean().default(false)
})

const fetchData=async ()=>{
    const data={
        prof:[
            {
                name: "Professor A",
                score: 4,
            },
            {
                name: "Professor B",
                score: 1,
            },
            {
                name: "Professor C",
                score: 3,
            },
            {
                name: "Professor D",
                score: 4,
            },
            {
                name: "Professor E",
                score: 5,
            },
        ],
        course:[
            {code:'CISC1001'},
            {code:'ACCT1001'},
            {code:'CISC2005'},
            {code:'BECO1001'},
            {code:'BECO1002'}
        ]
    }

    return data
}
const allowLegacyRenegotiationOptions = {
    httpsAgent: new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
    headers: {
        Authorization: 'Bearer bfa9b6c0-3f4f-3b1f-92c4-1bdd885a1ca2',
    },
};

export default function Home() {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: "",
            is_prof: false,
        },
    })

    const router = useRouter()

    function onSubmit(values: z.infer<typeof formSchema>) {
        if (is_prof) {
            router.push('/search/instructor/' + values["code"].toUpperCase())
        }
        else {
            router.push('/search/course/' + values["code"].toUpperCase())
        }

    }

    const [is_prof, set_is_prof] = useState(false)
    const [statics_data, set_statics_data] = useState({ prof: [], course: [] })

    useEffect(() => {
        fetchData().then((data:any) => {
            set_statics_data(data)
        })
    },[])

    return (
        <>
            <div className='bg-gradient-to-r to-blue-600 from-indigo-600'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='flex justify-between mx-8 py-8 '>
                        <div className='md:flex flex-col justify-center text-white hidden space-y-2'>
                            <div className='text-4xl'>
                                澳大选咩课
                            </div>
                            <div className='text-3xl'>
                                What2REG @UM
                            </div>
                            <div className='text-base'>
                                專為澳大學生而設的課程評價網站
                            </div>
                            <div className='text-base'>
                                Course review platform for University of Macau
                            </div>
                        </div>
                        <Card className="md:mx-8 md:w-96 w-full mx-0">
                            <CardHeader>

                            </CardHeader>
                            <CardContent className='space-y-2'>
                                <div>
                                    <CardTitle >{is_prof ? '搜尋讲师' : '搜尋課程'}</CardTitle>
                                    <CardDescription >{is_prof ? 'Find Instructors' : 'Find Courses'}</CardDescription>
                                </div>
                                <Form {...form}>
                                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                                        <FormField
                                            control={form.control}
                                            name="code"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <Input placeholder={is_prof ? "e.g., CHAN Tai Man" : "e.g., ACCT1000 or Accounting"} {...field} />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="is_prof"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center space-x-2 mb-1">
                                                    <FormControl>
                                                        <Switch
                                                            checked={field.value}
                                                            onCheckedChange={(e) => {
                                                                field.onChange(e)
                                                                set_is_prof(!is_prof)
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <div className='my-0 flex items-center space-x-2'>
                                                        <div>
                                                            <FormLabel className="text-base">
                                                                搜索讲师
                                                            </FormLabel>
                                                            <FormDescription >
                                                                Search Instructors
                                                            </FormDescription>
                                                        </div>
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                        <Button type="submit" className='bg-gradient-to-r from-purple-400 to-rose-500'>
                                            <Search size={20} />
                                            Search
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                            <CardFooter className='text-xs text-gray-400 flex flex-col items-start'>
                                <div>輸入部分課程代碼/名稱或講師姓名</div>
                                <div className='max-w-sm'>Search by course codes/titles, or name of instructors (partial search supported)</div>
                                <div className='italic'>Data Source: reg.um.edu.mo</div>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>   
            <div>
            <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='grid grid-cols-1 md:grid-cols-2 mx-8 py-8 '>
                        <div className='md:flex flex-col justify-cente hidden space-y-8'>
                            <div className='text-2xl font-bold'>
                                Suggesstion or Feedback?
                            </div>
                            {/* add discord icon and link */}
                            <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-fit">
                                <Radar size={40} strokeWidth={1.75} />
                                <div className="">
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">UMHelper Community</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                    Be part of our community.
                                    </p>
                                </div>
                                <Button variant="secondary">Join Discord Server</Button>
                            </Card>
                        </div>
                        <div className='md:flex flex-col justify-center hidden space-y-8'>
                            <div className='text-2xl font-bold'>
                                We are open source!
                            </div>
                            <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-fit">
                                <Github size={40} strokeWidth={1.75} />
                                <div className="">
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">UMHelper Dev Group</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                    We need your help!
                                    </p>
                                </div>
                                <Button variant="secondary">Fix Bug NOW</Button>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        </>

    )
}
