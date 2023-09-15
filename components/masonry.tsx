// 1.col
// 2.row
// 3.add

import React, {ReactElement, ReactNode, useState} from "react";

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
                    <MasonryRow key={index} className={className}>
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
      className,
  }:{
      children:ReactElement[]
      col:number,
      className:any
  })=>{
    const colListGen=(col:number,children:ReactElement[])=>{
        let colList:ReactNode[][]=[]
        for (let i = 0; i < col; i++) {
            colList.push([])
        }

        for (let i = 0; i < children.length; i+=3) {
            for (let j = 0; j < col; j++) {
                colList[j].push(children[i+j])
            }
        }
        return colList
    }
    const [stateChildren,setStateChildren]=useState(children)
    const [colList,setColList]=useState(colListGen(col,stateChildren))
    return(
        <div className='flex md:flex-row space-x-2 flex-col'>
            {colList.map((col:ReactNode[],index:number)=>{
                return (
                    <MasonryCol key={index} className={className}>
                        {col}
                    </MasonryCol>
                )
            })}
        </div>
    )
}
