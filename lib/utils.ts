import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const delay = (ms:number) => new Promise(res => setTimeout(res, ms));

export const get_bg=(n:number)=>{
  let result_bg="bg-gradient-to-r from-amber-500 to-orange-500"
  if (n>=6){
      result_bg='bg-gradient-to-r from-green-400 to-emerald-500'
  }
  if (n<=3){
      result_bg='bg-gradient-to-r from-rose-900 to-fuchsia-800'
  }
  return result_bg
}

export const get_gpa=(n:number)=>{
  if (n>=8){
      return 'A'
  }
  if (n>=7.4){
      return 'A-'
  }
  if (n>=6.6){
      return 'B+'
  }
  if (n>=6){
      return 'B'
  }
  if (n>=5.4){
      return 'B-'
  }
  if (n>=4.6){
      return 'C+'
  }
  if (n>=4){
      return 'C'
  }
  if (n>=3.4){
      return 'C-'
  }
  if (n>=2.6){
      return 'D+'
  }
  if (n>=2){
      return 'D'
  }
  return 'F'
}