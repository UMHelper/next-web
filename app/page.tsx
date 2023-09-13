'use client'

import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {z} from "zod";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage} from "@/components/ui/form";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Switch} from "@/components/ui/switch";
import {useState} from "react";

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10,{message:'Search Keywords must be at most 10 characters.'}),
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

    function onSubmit(values: z.infer<typeof formSchema>) {
        console.log(values)
    }

    const [is_prof, set_is_prof]=useState(false)

  return (
    <div className='flex justify-between mx-8 py-8'>
        <div className='md:flex flex-col justify-center text-black hidden space-y-2'>
            <div className='text-4xl'>
                澳大选咩课
            </div>
            <div className='text-xl text-gray-800'>
                What2REG @UM
            </div>
            <div className='text-xl'>
                專為澳大學生而設的課程評價網站
            </div>
            <div className='text-base text-gray-800'>
                Course review platform for University of Macau
            </div>
        </div>
        <Card className="md:mx-8 md:w-96 min-w-max w-full mx-0">
            <CardHeader>

            </CardHeader>
            <CardContent className='space-y-2'>
                <div>
                    <CardTitle>{is_prof?'搜尋讲师':'搜尋課程'}</CardTitle>
                    <CardDescription className='text-base text-gray-800'>{is_prof?'Find your lecturer':'Find your course'}</CardDescription>
                </div>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
                        <FormField
                            control={form.control}
                            name="code"
                            render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <Input placeholder={is_prof?"e.g., CHAN Tai Man":"e.g., ACCT1000 or Accounting"} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="is_prof"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-4 mb-1">
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={(e)=>{
                                                field.onChange(e)
                                                set_is_prof(!is_prof)
                                            }}
                                        />
                                    </FormControl>
                                    <div className='my-0'>
                                        <FormLabel className="text-base">搜索讲师</FormLabel>
                                        <FormDescription>
                                            Search Lecturers
                                        </FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                        <Button type="submit">Search</Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter>
                <p className='text-xs text-gray-400 italic'>Data Source: reg.um.edu.mo</p>
            </CardFooter>
        </Card>
    </div>
  )
}
