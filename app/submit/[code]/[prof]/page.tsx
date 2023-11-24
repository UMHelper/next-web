"use client"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { zodResolver } from '@hookform/resolvers/zod';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Input } from "@/components/ui/input";
import * as z from "zod"
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';


const SubmitPage = ({ params }: { params: any }) => {
    const MAX_FILE_SIZE = 5000000;
    const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const [image, setImage] = useState<File | null | undefined>(null);
    const formSchema = z.object({
        code: z.string().length(8).default(params.code),
        prof: z.string().default(params.prof.replaceAll("%20", " ").replaceAll('$', '/')),
        attendance: z.enum(['1', '2.5', '5']).default('2.5'),
        pre: z.enum(['1', '2.5', '5']).default('2.5'),
        grade: z.number().min(0).max(5),
        hard: z.number().min(0).max(5),
        reward: z.number().min(0).max(5),
        assignment: z.number().min(0).max(5),
        recommend: z.number().min(0).max(5),
        content: z.string().min(0).max(1000),
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: params.code.toUpperCase(),
            prof: params.prof.replaceAll("%20", " ").replaceAll('$', '/').toUpperCase(),
            attendance: '2.5',
            pre: '2.5',
            grade: 2.5,
            hard: 2.5,
            reward: 2.5,
            assignment: 2.5,
            recommend: 2.5,
            content: '',
        }
    })
    const route = useRouter()
    const submit = (values: any) => {
        // console.log(typeof values)
        let data=new FormData()
        for (const key in values){
            data.append(key,values[key])
        }
        if (image) {
            if (!ACCEPTED_IMAGE_TYPES.includes(image.type)) {
                toast({
                    title: 'Image type not supported!',
                    description: "🤔 Please upload an image in JPEG, PNG or WEBP format.",
                    duration: 5000,
                })
                return
            }
            if (image.size > MAX_FILE_SIZE) {
                toast({
                    title: 'Image too large!',
                    description: "🤔 Please upload an image smaller than 5MB.",
                    duration: 5000,
                })
                return
            }
            data.append('image', image)
        }
        else{
            data.append('image','')
        }
        toast({
            title: 'Submitted!',
            description: "💋 Thank you for your submission!",
            duration: 5000,
        })
        // console.log(data)
        fetch(`/api/comment/${params.code}/${params.prof}`, {
            body: data,
            method: 'POST',
        })
        route.push(`/reviews/${params.code}/${params.prof}`)
    }
    return (
        <div className='max-w-screen-xl mx-auto p-10 md:p-20'>
            <div className='text-3xl antialiased mb-4'>
                Commenting on {params.prof.replaceAll("%20", " ").replaceAll('$', '/')} for {params.code}
            </div>
            <div>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(submit)} className='md:space-y-10 space-y-4'>
                        <div className='grid grid-cols-1 md:grid-cols-2 md:space-x-8'>
                            <FormField
                                control={form.control}
                                name="code"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Course Code</FormLabel>
                                        <FormControl>
                                            <Input {...field} disabled />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="prof"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Instructor</FormLabel>
                                        <FormControl>
                                            <Input {...field} disabled />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-2 md:space-x-8 space-y-4 md:space-y-0'>
                            <FormField
                                control={form.control}
                                name="attendance"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Attendance</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <div className='flex flex-row space-x-2 justify-between'>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="1" id="option-one" />
                                                        <Label htmlFor="option-one">Always</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="2.5" id="option-one" />
                                                        <Label htmlFor="option-one">Sometimes</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="5" id="option-one" />
                                                        <Label htmlFor="option-one">Never</Label>
                                                    </div>
                                                </div>
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="pre"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Presentations</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <div className='flex flex-row space-x-2 justify-between'>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="1" id="option-one" />
                                                        <Label htmlFor="option-one">Multiple</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="2.5" id="option-one" />
                                                        <Label htmlFor="option-one">Once</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="5" id="option-one" />
                                                        <Label htmlFor="option-one">Never</Label>
                                                    </div>
                                                </div>
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        </div>

                        <div className='grid grid-cols-1 md:grid-cols-3 md:space-x-8'>
                            <div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="grade"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div>
                                                    <FormLabel>Grades you get</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>😡 F</div>
                                                        <div className='text-xs'>😋 A</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={0.1}
                                                        defaultValue={[field.value]}
                                                        onChange={field.onChange} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="assignment"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div>
                                                    <FormLabel>Assignment</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>😩 Everyday</div>
                                                        <div className='text-xs'>💃 No assignment</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={0.1}
                                                        defaultValue={[field.value]}
                                                        onChange={field.onChange} />
                                                </FormControl>
                                                {/* <FormDescription>
                                                The higher the better grade.
                                            </FormDescription> */}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            <div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="hard"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div>
                                                    <FormLabel>Easy or Not</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>🤯 No</div>
                                                        <div className='text-xs'>👨‍🎓 Easy~</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={0.1}
                                                        defaultValue={[field.value]}
                                                        onChange={field.onChange} />
                                                </FormControl>
                                                {/* <FormDescription>
                                                The higher the better grade.
                                            </FormDescription> */}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="recommend"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div>
                                                    <FormLabel>Recommand or Not</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>👎 No</div>
                                                        <div className='text-xs'>👍 Yes!~</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={0.1}
                                                        defaultValue={[field.value]}
                                                        onChange={field.onChange} />
                                                </FormControl>
                                                {/* <FormDescription>
                                                The higher the better grade.
                                            </FormDescription> */}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                            <div>
                                <div>
                                    <FormField
                                        control={form.control}
                                        name="reward"
                                        render={({ field }) => (
                                            <FormItem>
                                                <div>
                                                    <FormLabel>What you learn in this course</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>👶 Nothing</div>
                                                        <div className='text-xs'>🧠 Everything!</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={0.1}
                                                        defaultValue={[field.value]}
                                                        onChange={field.onChange} />
                                                </FormControl>
                                                {/* <FormDescription>
                                                The higher the better grade.
                                            </FormDescription> */}
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>


                            <FormItem>
                                <FormLabel>Upload an image</FormLabel>
                                <FormControl>
                                    <Input type='file' onChange={
                                        (e) => {
                                            // console.log(e.target.files)
                                            setImage(e.target.files?.[0])
                                        }
                                    } />
                                </FormControl>
                            </FormItem>

                            <FormField
                                control={form.control}
                                name="content"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Comment on the instructor of this course</FormLabel>
                                        <div className="text-sm text-muted-foreground">
                                            <p>When you are writing your comment, please consider the following questions:</p>
                                            <br />
                                            <ul className=' list-inside list-disc'>
                                                <li>What have you learned from this course?</li>
                                                <li>這門課是否讓你受益匪淺？</li>
                                                <li>Did the teaching of the instructor in this course make your learning more passionate?</li>
                                                <li>你是否對這門課的學習一直保持熱情？</li>
                                                <li>Do you recommend classmates to choose this course, and what is the reason?</li>
                                                <li>你是否推薦同學選修這門課，並說明原因。</li>
                                            </ul>
                                            <br />
                                        </div>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Comment about this course or advice for your younger fellow students."
                                                className="resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormDescription>
                                            <span>
                                                You comment will be posted anonymously, but please make sure to adhere to our
                                            </span> <Link href="/" className='underline'>
                                                community guidelines
                                            </Link>
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button type="submit" className='space-x-2 bg-gradient-to-r from-violet-500 to-fuchsia-500'>
                            <UploadCloud size={18} strokeWidth={2.5} />
                            <span>Submit</span>
                        </Button>
                    </form>
                </Form>
            </div>
        </div>
    );
};
export default SubmitPage;
