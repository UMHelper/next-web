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
import { useUser } from "@clerk/nextjs";

const MAX_FILE_SIZE = 5000000;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const SubmitPage = ({ params }: { params: any }) => {
    const { isSignedIn, user } = useUser();
    const [image, setImage] = useState<File | null | undefined>(null);
    const formSchema = z.object({
        code: z.string().length(8).default(params.code),
        prof: z.string().default(params.prof.replaceAll("%20", " ").replaceAll('$', '/')),
        attendance: z.enum(['1', '3', '5']).default('3'),
        pre: z.enum(['1', '3', '5']).default('3'),
        grade: z.number().min(1).max(5),
        hard: z.number().min(1).max(5),
        reward: z.number().min(1).max(5),
        assignment: z.number().min(1).max(5),
        recommend: z.number().min(1).max(5),
        content: z.string().min(10).max(1000),
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: params.code.toUpperCase(),
            prof: params.prof.replaceAll("%20", " ").replaceAll('$', '/').toUpperCase(),
            attendance: '3',
            pre: '3',
            grade: 3,
            hard: 3,
            reward: 3,
            assignment: 3,
            recommend: 3,
            content: '',
        }
    })
    const route = useRouter()
    const submit = (values: any) => {

        let data = new FormData()
        for (const key in values) {
            data.append(key, values[key])
        }
        if (image) {
            if (!ACCEPTED_IMAGE_TYPES.includes(image.type)) {
                toast({
                    title: '❌ Image type not supported!',
                    description: "Please upload an image in JPEG, PNG or WEBP format.",
                    duration: 5000,
                })
                return
            }
            if (image.size > MAX_FILE_SIZE) {
                toast({
                    title: '❌ Image too large!',
                    description: "Please upload an image smaller than 5MB.",
                    duration: 5000,
                })
                return
            }
            data.append('image', image)
        }
        else {
            data.append('image', '')
        }
        if (isSignedIn) {
            data.append('verify', '1')
            data.append('verify_account', user.id)
        }
        else {
            data.append('verify', '0')
        }
        toast({
            title: '✅ Success!',
            description: "Thank you for your comments!",
            duration: 5000,
        })
        //console.log(data)
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
                                        <FormLabel>Attendance 出席檢查</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <div className='flex flex-row space-y-1 justify-between flex-wrap'>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="1" id="attend-1" />
                                                        <Label htmlFor="attend-1">Always 經常</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="3" id="attend-3" />
                                                        <Label htmlFor="attend-3">Sometimes 有時</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="5" id="attend-5" />
                                                        <Label htmlFor="attend-5">Never 從未</Label>
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
                                        <FormLabel>Presentations 演示頻次</FormLabel>
                                        <FormControl>
                                            <RadioGroup
                                                onValueChange={field.onChange}
                                                value={field.value}
                                            >
                                                <div className='flex flex-row space-y-1 justify-between flex-wrap'>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="1" id="pre-1" />
                                                        <Label htmlFor="pre-1">Multiple 多次</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="3" id="pre-3" />
                                                        <Label htmlFor="pre-3">Once 一次</Label>
                                                    </div>
                                                    <div className="flex items-center space-x-2">
                                                        <RadioGroupItem value="5" id="pre-5" />
                                                        <Label htmlFor="pre-5">Never 從未</Label>
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
                                                    <FormLabel>Grades Obtained 獲得的成績</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>😡 F</div>
                                                        <div className='text-xs'>😋 A</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={1}
                                                        defaultValue={[field.value]}
                                                        onValueChange={(e)=>{
                                                            field.onChange(e[0])
                                                        }} />
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
                                                    <FormLabel>Workload 課程工作量</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>😩 Very heavy 繁重</div>
                                                        <div className='text-xs'>💃 No assignments 輕鬆</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={1}
                                                        defaultValue={[field.value]}
                                                        onValueChange={(e)=>{
                                                            field.onChange(e[0])
                                                        }} />
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
                                                    <FormLabel>Course Difficulty 內容難易程度</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>🤯 Hard 難以理解</div>
                                                        <div className='text-xs'>👨‍🎓 Easy 簡單易懂</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={1}
                                                        defaultValue={[field.value]}
                                                        onValueChange={(e)=>{
                                                            field.onChange(e[0])
                                                        }} />
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
                                                    <FormLabel>Recommand 推薦程度</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>👎 No</div>
                                                        <div className='text-xs'>👍 Yes!</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={1}
                                                        defaultValue={[field.value]}
                                                        onValueChange={(e)=>{
                                                            field.onChange(e[0])
                                                        }} />
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
                                                    <FormLabel>Usefulness 課程實用性</FormLabel>
                                                    <div className='flex flex-row justify-between mt-2'>
                                                        <div className='text-xs'>👶 Useless 完全無用</div>
                                                        <div className='text-xs'>🧠 Valuable! 十分有價值</div>
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Slider
                                                        max={5}
                                                        min={1}
                                                        step={1}
                                                        defaultValue={[field.value]}
                                                        onValueChange={(e)=>{
                                                            field.onChange(e[0])
                                                        }} />
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

                        <div className=' space-y-2'>
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
                                                <li>How is the course arranged and why do you like or dislike it? </li>
                                                <li>What have you learned from this course? </li>
                                                <li>Did the teaching of the instructor in this course make your learning more passionate?</li>
                                                <li>Why do you recommend this course or not? </li>
                                                <br/>
                                                
                                                <li>這門課程的安排如何，以及你為何喜歡或不喜歡其中的哪些？</li>
                                                <li>這門課是否讓你受益匪淺？</li>
                                                <li>你是否對這門課的學習一直保持熱情？</li>
                                                <li>為何你推薦或不推薦同學選修這門課？</li>

                                            </ul>
                                            <br />
                                        </div>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Comment about this course or advice for your fellow students."
                                                className="resize-y h-48"
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

                        <div className=' space-y-6'>

                            <FormItem>
                                <FormLabel>Image Upload 上載圖像 (optional)</FormLabel>
                                <FormControl>
                                    <Input type='file' onChange={
                                        (e) => {

                                            setImage(e.target.files?.[0])
                                        }
                                    }
                                        disabled={!isSignedIn}
                                    />
                                </FormControl>
                                {
                                    !isSignedIn ? (
                                        <FormDescription className=' text-red-400'>
                                            <span>
                                                Please sign in to upload an image.<br />
                                                您必須登入以上載圖像。
                                            </span>
                                        </FormDescription>
                                    ) : null
                                }
                            </FormItem>

                            {
                                isSignedIn ? (
                                    <FormDescription>
                                        NOTE: You will submit this comment as {user?.firstName} {user?.lastName}. You can change this display name in user settings.
                                    </FormDescription>
                                ) : null
                            }
                            <Button type="submit" className='space-x-2 bg-gradient-to-r from-violet-500 to-fuchsia-500'>
                                <UploadCloud size={18} strokeWidth={2.5} />
                                <span>Submit</span>
                            </Button>
                            <div className='py-2 text-xs text-red-500 break-words'>
                                <p>New comments are usually published in 3 minutes. </p>
                                <p>新發表的評價通常在 3 分鐘內公開展示。</p>
                            </div>
                        </div>
                    </form>
                </Form>
            </div>
        </div>
    );
};
export default SubmitPage;
