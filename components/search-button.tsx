'use client'
import { Search } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const formSchema = z.object({
    code: z.string()
        .min(4, {
            message: "Search Keywords must be at least 4 characters.",
        })
        .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
    is_prof: z.boolean().default(false)
})

const SearchButton = () => {
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: "",
            is_prof: false,
        },
    })
    const router = useRouter()

    function onSubmit(values: z.infer<typeof formSchema>) {
        wait().then(() => setOpen(false));
        if (is_prof) {
            router.push('/search/instructor/' + values["code"].toUpperCase())
        }
        else {
            router.push('/search/course/' + values["code"].toUpperCase())
        }
        
    }
    const [is_prof, set_is_prof] = useState(false)
    const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
    const [open, setOpen] = useState(false);
    const pathnames = usePathname()
    if (pathnames==="/" || pathnames.startsWith("/timetable") || pathnames.startsWith("/search") ){
        return null
    }
    return (
        <div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger className="flex items-center">
                    <Search size={20} strokeWidth={2} />
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        {/* <div className="text-2xl text-center py-5">Search</div> */}
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
                                <Button type="submit" className='bg-gradient-to-r from-blue-600 to-indigo-500 w-full'>
                                    <Search size={20} /><span>Search</span>
                                </Button>
                            </form>
                        </Form>
                    </DialogHeader>
                </DialogContent>
            </Dialog>

        </div>
    )
}

export default SearchButton
