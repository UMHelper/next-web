'use client'
import { cn, delay } from "@/lib/utils";
import React, {ReactElement, ReactNode, useEffect, useState, useRef} from "react";
import AdBanner from "@/components/ad";
import { BbsCard, fetchBbsUpdatesRandom } from "@/components/bbs-updates";

import autoAnimate from '@formkit/auto-animate'

export const MasonryRow=({children,className}:{children:ReactNode,className:any})=>{
    return (
        <div className={className}>
            {children}
        </div>
    )
}

export const MasonryCol=(
    {
        children,
        className
    }:{
        children:ReactNode[],
        className:any
    })=>{
    return(
        <div className='flex-col space-y-4'>
            {children.map((child,index)=>{
                return (
                    <MasonryRow key={"row"+index} className={className}>
                        {child}
                    </MasonryRow>
                )
            })}
        </div>
    )
}

const colListGen=(col_num:number,children:ReactElement[],bbsdata:any)=>{
    let colList:ReactNode[][]=[]
    for (let i = 0; i < col_num; i++) {
        colList.push([])
    }

    for (let i = 0; i < children.length; i+=col_num) {
        for (let j = 0; j < col_num; j++) {
            colList[j].push(children[i+j])

            if (Math.random()>0.9){
                // rondomly choose one form bbsdata.data
                // let bbs = bbsdata.data[Math.floor(Math.random()*bbsdata.data.length)]
                colList[j].push(
                    <div key={"gad-"+i+j}>
                        {/* <BbsCard comment={bbs} is_ad={true}/> */}
                        <AdBanner/> 
                    </div>
                )
            }
        }
    }
    return colList
}


export const Masonry=(
  {
      children,
      col=3,
      className="",
  }:{
      children:ReactElement[]
      col:number,
      className?:any
  })=>{
    const [curCol,setCurCol]=useState(col)
    const [colList,setColList]=useState<Array<any>>([])

    // const [bbsdata, setBbsData] = useState({ "data": [{ "id": 1, "content": "One second...", "verify_account": "placeholder", "title": "Loading", "pub_time": "1985-01-01T00:00:01" }], "code": 1 })
    const parent = useRef(null)
    
    useEffect(() => {
        parent.current && autoAnimate(parent.current)
    }, [parent])

      
    // useEffect(() => {
    //     fetchBbsUpdatesRandom().then((data) => {
    //         setBbsData(data)
    //     })
    // }, [])
    useEffect(()=>{
        let h = window.innerWidth;
        if (h<900 && h>=530){
            setCurCol(col-1)
        }
        if (h<530){
            setCurCol(col-2)
        }
        if (h>=900){
            setCurCol(col)
        }
    },[col])

    useEffect(()=>{
        setColList(colListGen(curCol,children,[]))
    },[curCol,children])

    useEffect(() => {
        const windowResizeUpdate = () => {
            let h = window.innerWidth;
            if (h<900 && h>=530){
                setCurCol(col-1)
            }
            if (h<530){
                setCurCol(col-2)
            }
            if (h>=900){
                setCurCol(col)
            }
        };
        window.addEventListener('resize', windowResizeUpdate);
        return () => {
            window.removeEventListener('resize', windowResizeUpdate);
        }
    }, [col]);

    return(
        <div className={cn(
            'grid','gap-4',"grid-cols-"+(curCol))}
            ref={parent}
            >
            {colList.map((col:ReactNode[],index:number)=>{
                return (
                    <MasonryCol key={"col"+index} className={className}>
                        {col}
                    </MasonryCol>
                )
            })}
        </div>
    )
}
