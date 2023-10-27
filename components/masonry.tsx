// 1.col
// 2.row
// 3.add

import { cn } from "@/lib/utils";
import { MongoCryptCreateEncryptedCollectionError } from "mongodb";
import React, {ReactElement, ReactNode, useEffect, useState} from "react";
import { set } from "zod";

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

    const colListGen=(col_num:number,children:ReactElement[])=>{
        let colList:ReactNode[][]=[]
        for (let i = 0; i < col_num; i++) {
            colList.push([])
        }

        for (let i = 0; i < children.length; i+=col_num) {
            for (let j = 0; j < col_num; j++) {
                colList[j].push(children[i+j])
            }
        }
        return colList
    }
    const windowResizeUpdate = () => {
        let h = window.innerWidth;
        if (h<780 && h>=530){
            setCurCol(col-1)
        }
        if (h<530){
            setCurCol(col-2)
        }
        if (h>=780){
            setCurCol(col)
        }
        setColList(colListGen(curCol,children))
        console.log(colList,curCol)
    };
    useEffect(()=>{
        let h = window.innerWidth;
        if (h<780 && h>=530){
            setCurCol(col-1)
        }
        if (h<530){
            setCurCol(col-2)
        }
        if (h>=780){
            setCurCol(col)
        }
        setColList(colListGen(curCol,children))
        console.log(colList,curCol)
    },[colListGen])

    useEffect(() => {
        window.addEventListener('resize', windowResizeUpdate);
        return () => {
            window.removeEventListener('resize', windowResizeUpdate);
        }
    }, [colListGen]);

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
