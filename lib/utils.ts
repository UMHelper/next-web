import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const get_bg=(n:number)=>{
  let result_bg="bg-gradient-to-r from-amber-500 to-orange-500"
  if (n>=6){
      result_bg='bg-gradient-to-r from-green-400 to-emerald-500'
  }
  if (n<=3){
      result_bg='bg-gradient-to-r from-rose-900 to-fuchsia-800'
  }
  if (n===0){
    result_bg='bg-gradient-to-r from-gray-400 to-gray-500'
  }
  return result_bg
}

export const get_gpa=(n:number)=>{
    if (n===0){
        return 'N/A'
    }
    return n
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
  if (n===0){
    return "N/A"
  }
  return 'F'
} 

export const ua_check=(ua:string)=>{
    return (
        ua.indexOf(" Mobile/") > 0 &&
        ua.indexOf(" Safari/") === -1
      ) || (
        ua.indexOf("Android") > 0 &&
        ua.indexOf(" wv") > 0
      ) ;
}

export const uuid = () => {
    // 随机生成英文字母
    const randomLetter = String.fromCharCode(Math.round(Math.random() * 25) + 65);
    return randomLetter + Date.now().toString(36);
};