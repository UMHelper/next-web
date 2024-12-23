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
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
    is_prof: z.boolean().default(false)
})

export default function SearchComp() {
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
        <div className='bg-[url("/banner.jpg")] bg-cover'>
            <div className='max-w-screen-xl mx-auto p-2'>
                <div className='flex justify-between mx-2 py-10 md:py-8 '>
                    <div className='md:flex flex-col justify-center text-white hidden space-y-2  p-6'>
                        <h1 className='text-4xl'>
                            What2Reg @UM
                        </h1>
                        <h1 className='text-3xl'>
                            澳大選咩課
                        </h1><br></br>
                        <h2 className='text-base'>
                            Course review platform for University of Macau
                        </h2>
                        <h2 className='text-base'>
                            專為澳大學生而設的課程評價網站
                        </h2>
                    </div>
                    <Card className="md:mx-8 md:w-96 w-full mx-0 backdrop-blur-3xl bg-transparent border-none">
                        <CardHeader>

                        </CardHeader>
                        <CardContent className='space-y-2'>
                            <div className="text-white">
                                <CardTitle >{is_prof ? 'Search Instructors' : 'Search Courses'}</CardTitle>
                                <CardDescription className="text-white/80">{is_prof ? '搜尋講師' : '搜尋課程'}</CardDescription>
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
                                                                            <FormLabel className="text-base text-white">
                                                                                Search Instructors
                                                                            </FormLabel>
                                                                            <FormDescription className="text-white/80">
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
                                    <br/>
                                    <Button type="submit" className='bg-gradient-to-r from-blue-600 to-indigo-500'>
                                        <Search size={20} /><span>Search</span>
                                    </Button>
                                </form>
                            </Form>
                        </CardContent>
                        <CardFooter className='text-xs text-white/80 flex flex-col items-start space-y-1'>
                            <div className='max-w-sm'>Search by course codes/titles, or name of instructors (partial search supported)</div>
                            <div>鍵入部分課程代碼/名稱或講師姓名</div><br></br>
                            <div className='italic'>Data Source: reg.um.edu.mo</div>
                            <div className='italic'>Last updated on: 2024-12-23</div>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    )
}