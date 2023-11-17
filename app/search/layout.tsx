'use client'
import React, { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
})


export default function RootLayout({ children, }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const pathname_list = pathname.split('/')

    const router = useRouter()

    const [is_prof, serIsProf] = useState(pathname_list[2] === 'instructor')

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: decodeURI(pathname_list.slice(3).join('/').toUpperCase().replaceAll('%20', ' ').replaceAll('$', '/'))
        },
    })

    function onSubmit(values: z.infer<typeof formSchema>) {
        if (is_prof) {
            router.push('/search/instructor/' + values["code"].toUpperCase())
        }
        else {
            router.push('/search/course/' + values["code"].toUpperCase())
        }

    }

    return (
        <div className='max-w-screen-xl mx-auto p-4 space-y-4'>
            <div className='text-2xl font-semibold'>
                You are searching:
            </div>
            <div className="md:flex md:flex-row space-y-3 items-center justify-between">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                        <div className="flex flex-row space-x-4">
                            <FormField
                                control={form.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormControl>
                                            <Input placeholder={pathname_list[2] === 'instructor' ? "e.g., CHAN Tai Man" : "e.g., ACCT1000 or Accounting"} {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="submit" className='bg-gradient-to-r from-blue-600 to-indigo-500'>
                                <Search size={20} />
                                <span>Search</span>
                            </Button>
                        </div>
                    </form>
                </Form>
                <div className="my-0 flex items-center space-x-2">
                    <Switch
                        checked={is_prof}
                        onClick={() => {
                            if (is_prof) {
                                serIsProf(false)
                                router.push('/search/course/' + pathname_list[3].toUpperCase())
                            }
                            else {
                                serIsProf(true)
                                router.push('/search/instructor/' + pathname_list[3].toUpperCase())
                            }
                        }}
                    />
                    <div>
                        <div>
                            {
                                'Search Intructors'
                            }
                        </div>
                        <div>
                            {
                                '搜尋讲师'
                            }
                        </div>
                    </div>
                </div>
            </div>
            {children}
        </div>
    )
}