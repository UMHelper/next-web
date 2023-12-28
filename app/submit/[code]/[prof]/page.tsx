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
import { SignInButton, useUser } from "@clerk/nextjs";
import { Rating, Heart } from '@smastrom/react-rating';

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
            grade: 0,
            hard: 0,
            reward: 0,
            assignment: 0,
            recommend: 0,
            content: '',
        }
    })
    const route = useRouter()
    const submit = (values: any) => {

        //console.log(values)

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
                        <div className='grid grid-cols-1 md:grid-cols-2 md:space-x-8 space-y-4 md:space-y-0 hidden'>
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
                                                <div className='flex flex-row flex-wrap'>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
                                                        <RadioGroupItem value="1" id="attend-1" />
                                                        <Label htmlFor="attend-1">Always 經常</Label>
                                                    </div>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
                                                        <RadioGroupItem value="3" id="attend-3" />
                                                        <Label htmlFor="attend-3">Sometimes 有時</Label>
                                                    </div>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
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
                                                <div className='flex flex-row flex-wrap'>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
                                                        <RadioGroupItem value="1" id="pre-1" />
                                                        <Label htmlFor="pre-1">Multiple 多次</Label>
                                                    </div>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
                                                        <RadioGroupItem value="3" id="pre-3" />
                                                        <Label htmlFor="pre-3">Once 一次</Label>
                                                    </div>
                                                    <div className="flex items-center ps-1 pe-5 pb-1 space-x-1">
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

                        <div>
                            <FormField
                                control={form.control}
                                name="recommend"
                                render={({ field }) => (
                                    <FormItem>
                                        <div>
                                            <FormLabel>Overall Recommend 總體推薦程度</FormLabel>
                                        </div>

                                        <div className="inline-flex items-center">
                                            <FormControl>
                                                <Rating
                                                    style={{ width: 180 }}
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                    itemStyles={{
                                                        itemShapes: Heart,
                                                        activeFillColor: '#F05941',
                                                        inactiveFillColor: '#FFEEF4',
                                                    }}
                                                    isRequired
                                                />
                                            </FormControl>
                                            <FormMessage />
                                            <div className='px-3'>
                                                <div className='text-sm'> {`${['None', 'Never!', 'Better not', 'Alright', 'Recommend', 'Completely'][field.value]}`}</div>
                                                <div className='text-xs text-muted-foreground'>{`${['未選擇', '絕不推薦', '比較不推薦', '無所謂', '比較推薦', '非常推薦'][field.value]}`}</div>
                                            </div>
                                        </div>
                                    </FormItem>
                                )}
                            />
                        </div>
                        <div className='grid grid-cols-1 md:grid-cols-2'>

                            <div>
                                <FormField
                                    control={form.control}
                                    name="grade"
                                    render={({ field }) => (
                                        <FormItem className="pb-3">
                                            <div>
                                                <FormLabel>Grades Obtained 獲得的成績</FormLabel>
                                            </div>

                                            <div className="inline-flex items-center">
                                                <FormControl>
                                                    <Rating
                                                        style={{ width: 180 }}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        isRequired
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <div className='px-3'>
                                                    <div className='text-sm'> {`${['None', 'F', 'D', 'C', 'B', 'A'][field.value]}`}</div>
                                                    <div className='text-xs text-muted-foreground'>{`${['未選擇', 'or NP', 'or D-/+', 'or C-/+', 'or B-/+', 'or A-/P'][field.value]}`}</div>
                                                </div>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div>
                                <FormField
                                    control={form.control}
                                    name="assignment"
                                    render={({ field }) => (
                                        <FormItem className="pb-3">
                                            <div>
                                                <FormLabel>Workload 課程工作量</FormLabel>
                                            </div>

                                            <div className="inline-flex items-center">
                                                <FormControl>
                                                    <Rating
                                                        style={{ width: 180 }}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        isRequired
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <div className='px-3'>
                                                    <div className='text-sm'> {`${['None', 'Very heavy', 'Busy', 'OK', 'Light', 'No effort'][field.value]}`}</div>
                                                    <div className='text-xs text-muted-foreground'>{`${['未選擇', '非常繁重', '繁重', '普通', '輕鬆', '毫無壓力'][field.value]}`}</div>
                                                </div>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <div>
                                <FormField
                                    control={form.control}
                                    name="hard"
                                    render={({ field }) => (
                                        <FormItem className="pb-3">
                                            <div>
                                                <FormLabel>Difficulty 難易程度</FormLabel>
                                            </div>

                                            <div className="inline-flex items-center">
                                                <FormControl>
                                                    <Rating
                                                        style={{ width: 180 }}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        isRequired
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <div className='px-3'>
                                                    <div className='text-sm'> {`${['None', 'Very hard', 'Hard', 'Moderate', 'Easy', 'Very easy'][field.value]}`}</div>
                                                    <div className='text-xs text-muted-foreground'>{`${['未選擇', '難以理解', '困難', '適當', '簡單', '非常簡單'][field.value]}`}</div>
                                                </div>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div>
                                <FormField
                                    control={form.control}
                                    name="reward"
                                    render={({ field }) => (
                                        <FormItem className="pb-3">
                                            <div>
                                                <FormLabel>Usefulness 課程實用性</FormLabel>
                                            </div>

                                            <div className="inline-flex items-center">
                                                <FormControl>
                                                    <Rating
                                                        style={{ width: 180 }}
                                                        value={field.value}
                                                        onChange={field.onChange}
                                                        isRequired
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <div className='px-3'>
                                                    <div className='text-sm'> {`${['None', 'Waste of time', 'Not useful', 'Not quite', 'Easy', 'Very easy'][field.value]}`}</div>
                                                    <div className='text-xs text-muted-foreground'>{`${['未選擇', '完全浪費時間', '意義不大', '有一點意義', '比較實用', '非常實用'][field.value]}`}</div>
                                                </div>
                                            </div>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </div>

                        <div className=' space-y-2'>
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
                            </FormItem>

                            {
                                isSignedIn ? (
                                    <FormDescription>
                                        Note: The comment will be posted anonymously (logged in as {user?.firstName} {user?.lastName}).
                                    </FormDescription>
                                ) :
                                    <FormDescription className=' text-red-400'>
                                        <span>
                                            You must <SignInButton mode='modal'><span className='underline'>Sign in (click here)</span></SignInButton> to upload an image for our content safety. <br />
                                            為保證內容安全，您必須 <SignInButton mode='modal'><span className='underline'>登入 (點擊此處)</span></SignInButton> 以上載圖像。
                                        </span>

                                    </FormDescription>
                            }
                        </div>

                        <div className=' space-y-2'>

                            <FormField
                                control={form.control}
                                name="content"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Comment on the instructor of this course</FormLabel>
                                        <div className="text-sm text-muted-foreground">
                                            <p>When you are writing your comment, consider these problems and possible improvements:</p>
                                            <br />
                                            <ul className=' list-inside list-disc'>
                                                <li>Does the course cover useful topics and content? </li>
                                                <li>Is the assessment reasonably arranged (assignments, exams, etc.)? </li>
                                                <li>Did the teaching of the instructor make your learning more passionate?</li>
                                                <br />

                                                <li>這門課程的內容包含什麼，這些內容是否合理和有意義？</li>
                                                <li>這門課的評核（作業，考試等）是否合理？</li>
                                                <li>這門課的講師的授課是否使你對學習保持熱情？</li>

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

                            <Button type="submit" className='space-x-2 bg-gradient-to-r from-violet-500 to-fuchsia-500'>
                                <UploadCloud size={18} strokeWidth={2.5} />
                                <span>Submit</span>
                            </Button>
                            <div className='py-2 text-xs break-words'>
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
