'use client'
import { cn } from '@/lib/utils';
import {Cat, MessageCircle, VenetianMask} from 'lucide-react';
import { StrictMode, useEffect, useRef, useState } from 'react';
import { Input } from "@/components/ui/input"
import { Button } from '@/components/ui/button';


const ChatMessage=({message, type, t_key}:{message:string, type:'AI'|'HUMAN', t_key:number})=>{
    return(
        <div className={cn('flex flex-row w-full', type==='HUMAN'?' flex-row-reverse pl-2':'pr-2')} key={t_key}>
            {type==='AI'?
            <div className={cn('p-2 m-1 bg-blue-600 rounded-full h-fit w-fit')}>
                <Cat strokeWidth={1.5} size={18} color='white'/>
            </div>
            : 
            <div className={cn('p-2 m-1 bg-slate-400 rounded-full h-fit w-fit')}>
                <VenetianMask strokeWidth={1.5} size={18} color='white'/>
            </div>
            }
            <div className={cn('rounded p-1 my-1 w-fit px-2 text-sm h-fit break-words',type==='AI'?' bg-slate-50 ':'bg-blue-50 ')}>
                <p>{message}</p>
            </div>
        </div>
    )
}

const AIMessage=({userMessage, t_key, setIsGenerating}:{userMessage:string, t_key:number, setIsGenerating:any})=>{
    const [message, setMessage]=useState('Generating response...')

    const initialized = useRef(false)
    useEffect(()=>{
        if (initialized.current){
            return
        }
        initialized.current=true
        setIsGenerating(true)
        fetch('https://umeh-chat-bot.fly.dev/api/chat/stream',{
            method: 'POST',
            body: JSON.stringify({
                input: {
                    question: userMessage
                }}),
        }).then(response=>response.body).then(async (body:any)=>{
            const reader=body.getReader()
            const decoder=new TextDecoder()
            const loopRunner = true;
            
            let isStarted = false;
            while (loopRunner) {
                // Here we start reading the stream, until its done.
                const { value, done } = await reader.read();
                if (done) {
                    break;
                }
                const decodedChunk = decoder.decode(value, { stream: true });

                const events=decodedChunk.split('\n\r')
                const events_lsit=events.map((event)=>{
                    let t_event=event.split('\r\n')
                    t_event=t_event.map((e)=>{
                        return e.replaceAll('\n','').replaceAll('\r','')
                    })
                    return t_event
                })

                events_lsit.forEach((event)=>{
                    console.log(event[0])
                    if (event[0]==='event: data'){
                        console.log(event[1])
                        
                        let new_content=event[1].replaceAll('data: "',"")
                        new_content=new_content.substring(0,new_content.length-1)

                        if (isStarted){
                            setMessage((prevMessage)=>prevMessage+new_content)
                        }
                        else{
                            setMessage(new_content)
                            isStarted=true
                        }
                    }
                    if (event[0]==='event: end'){
                        setIsGenerating(false)
                        return
                    }
                })

            }
        
        })

    },[userMessage,setIsGenerating,setMessage])
    return(
        <ChatMessage message={message} type='AI' t_key={t_key} key={t_key}/>
    )
}

const HumanMessage=({message, t_key}:{message:string,t_key:number})=>{
    return(
        <ChatMessage message={message} type='HUMAN' t_key={t_key} key={t_key}/>
    )
}

const AiChatBot=()=>{
    const [isOpen, setIsOpen]=useState(true);
    const [isGenerating, setIsGenerating]=useState(false)

    const [currentMessage, setCurrentMessage]=useState('');

    const [messages, setMessages]=useState([<ChatMessage message='Hello! How can I assist you today?' type='AI' t_key={0} key={0}/>])
    return(
        <StrictMode>
        <div className=''>
            <div className={cn('p-2 bg-blue-600 fixed bottom-8 lg:left-4 left-1 z-50 hover:bg-blue-800 ','rounded-full ')} 
                onClick={()=>setIsOpen(!isOpen)}
            >
                <MessageCircle strokeWidth={1.5} size={32} color='white'/>
            </div>
            <div 
                className={cn(
                    'fixed bottom-28 lg:left-4 left-1 z-50 shadow-lg border bg-white h-2/3 lg:w-1/4 md:w-1/3 w-1/2 rounded-lg my-8 py-1', 
                    isOpen?'block':'hidden')}>
                <div className='px-2 overflow-scroll h-full'>
                    <div className='text-xs text-slate-400 text-center'>
                        Powered by ChatGPT
                    </div>
                    {messages.map((message, index)=>
                        message
                    )}
                    </div>
                <div className='px-1 -bottom-14 absolute w-full flex space-x-1 bg-white border rounded-lg py-2 shadow'>
                    <Input 
                        className='text-sm py-1 h-fit'
                        placeholder='Type a message'
                        value={currentMessage}
                        onChange={(e)=>setCurrentMessage(e.target.value)}
                        />
                    <Button 
                        className='text-sm py-1 h-fit w-fit px-1'
                        onClick={
                            ()=>{
                                if (currentMessage===''){
                                    return
                                }
                                setMessages([...messages, 
                                    <HumanMessage message={currentMessage} t_key={messages.length} key={messages.length}/>,
                                    <AIMessage userMessage={currentMessage} t_key={messages.length+1} setIsGenerating={setIsGenerating} key={messages.length+1} setIsGenerating={setIsGenerating}/>])
                                    setCurrentMessage('')
                                }
                                
                            }
                            disabled={isGenerating}
                            >
                        Send
                    </Button>
                </div>
            </div>
        </div>
        </StrictMode>
    )
}

export default AiChatBot;