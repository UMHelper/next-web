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
import { useForm } from "react-hook-form";
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
import { useState } from "react";
import { Search, Radar, Github, Quote, UserPlus, BookMarked, Bot, CircleDollarSign, Microscope, Newspaper, Scale, School } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CommentBank from "@/components/comment-bank";

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
    is_prof: z.boolean().default(false)
})

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

    return (
        <>
            <div className='bg-[url("/banner.jpg")] bg-cover'>
                <div className='max-w-screen-xl mx-auto p-2'>
                    <div className='flex justify-between mx-2 py-8 '>
                        <div className='md:flex flex-col justify-center text-white hidden space-y-2 p-6'>
                            <h1 className='text-4xl'>
                                澳大選咩課
                            </h1>
                            <div className='text-3xl'>
                                What2Reg @UM
                            </div><br></br>
                            <h2 className='text-base'>
                                專為澳大學生而設的課程評價網站
                            </h2>
                            <div className='text-base'>
                                Course review platform for University of Macau
                            </div>
                        </div>
                        <Card className="md:mx-8 md:w-96 w-full mx-0">
                            <CardHeader>

                            </CardHeader>
                            <CardContent className='space-y-2'>
                                <div>
                                    <CardTitle >{is_prof ? '搜尋講師' : '搜尋課程'}</CardTitle>
                                    <CardDescription >{is_prof ? 'Find Instructors' : 'Find Courses'}</CardDescription>
                                </div>
                                <Form {...form}>

                                    <FormField
                                        control={form.control}
                                        name="is_prof"
                                        render={({ field }) => (
                                            <FormItem className="flex flex-row items-center space-x-2 mb-1">
                                                <div className='my-0 flex items-center space-x-2'>
                                                    <div>
                                                        <FormLabel className="text-base">
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
                                                                                    Search Instructors
                                                                                </FormLabel>
                                                                                <FormDescription >
                                                                                    搜索講師
                                                                                </FormDescription>
                                                                            </div>
                                                                        </div>
                                                                    </FormItem>
                                                                )}
                                                            />
                                                        </FormLabel>
                                                    </div>
                                                </div>
                                            </FormItem>
                                        )}
                                    />
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
                                        <br></br>
                                        <Button type="submit" className='bg-gradient-to-r from-blue-600 to-indigo-500'>
                                            <Search size={20} /><span>Search</span>
                                        </Button>
                                    </form>
                                </Form>
                            </CardContent>
                            <CardFooter className='text-xs text-gray-400 flex flex-col items-start'>
                                <div>鍵入部分課程代碼/名稱或講師姓名</div>
                                <div className='max-w-sm'>Search by course codes/titles, or name of instructors (partial search supported)</div><br></br>
                                <div className='italic'>Data Source: reg.um.edu.mo</div>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            </div>



            <div className='max-w-screen-xl mx-auto p-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 mx-4 py-8 gap-y-8 gap-x-16'>
                    <div className='flex flex-col justify-center space-y-8 items-center md:items-start justify-stretch'>
                        <div className='text-2xl font-bold'>
                            Suggesstions or Feedback?
                        </div>
                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Quote size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Report and Feedback</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Report problems, bugs, and suggestions.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link href='https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'>
                                    Report Form
                                </Link>
                            </div>
                        </Card>
                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Radar size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Our Community</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Be part of our community.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link href='https://discord.gg/y8RsDQbw'>
                                    Discord Server
                                </Link>
                            </div>
                        </Card>
                    </div>
                    <div className='flex flex-col justify-center space-y-8 items-center md:items-start justify-stretch'>
                        <div className='text-2xl font-bold'>
                            We are open source!
                        </div>


                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <UserPlus size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">UMHelper Dev Group</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Join us and contribute together.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link className="p-1" href="https://github.com/UMHelper/Feedback-and-Join-Us/blob/master/Join.md">
                                    Join us
                                </Link>
                            </div>
                        </Card>

                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Github size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">What2Reg Ver. "Next"</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Check out this project on GitHub.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link className="p-1" href="https://github.com/UMHelper/next-web/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+">
                                    Fix Bugs Now
                                </Link>
                            </div>
                        </Card>
                    </div>

                </div>
            </div>

            <div className='max-w-screen-xl mx-auto p-4'>

                <div className="mx-8 py-8">
                    <div className="text-center text-2xl pb-8">
                        Our Comment Bank
                    </div>
                    <CommentBank />
                </div>
            </div>
        </>

    )
}
