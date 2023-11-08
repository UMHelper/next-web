'use client'
import { cn } from "@/lib/utils";
import React, {ReactElement, ReactNode, useEffect, useState} from "react";
import AdBanner from "@/components/ad";

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

const colListGen=(col_num:number,children:ReactElement[])=>{
    let colList:ReactNode[][]=[]
    for (let i = 0; i < col_num; i++) {
        colList.push([])
    }

    for (let i = 0; i < children.length; i+=col_num) {
        for (let j = 0; j < col_num; j++) {
            colList[j].push(children[i+j])
            // randomly add ad card
            if (Math.random()>0.8){
                colList[j].push(
                    <div key={"gad-"+i+j}>
                       <AdBanner/> 
                    </div>
                )
                console.log("ad added",j,i)
            }
        }
    }
    return colList
}


export const Masonry=(
  {
      children,
      col,
      className="",
  }:{
      children:ReactElement[]
      col:number,
      className:any
  })=>{
    const [curCol,setCurCol]=useState(col)
    const [colList,setColList]=useState<Array<any>>([])

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
    },[])

    useEffect(()=>{
        setColList(colListGen(curCol,children))
    },[curCol])

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
    }, []);

    return(
        <div className={cn(
            'grid','gap-4',"grid-cols-"+(curCol))}>
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
