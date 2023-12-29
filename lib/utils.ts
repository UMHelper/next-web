import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export const get_bg = (n: number) => {
    let result_bg = "bg-gradient-to-r from-gray-400 to-gray-500"
    if (n > 0) {
        result_bg = 'bg-gradient-to-r from-rose-900 to-fuchsia-800'
    }
    if (n >= 2.7) {
        result_bg = 'bg-gradient-to-r from-amber-500 to-orange-500'
    }
    if (n >= 3.3) {
        result_bg = 'bg-gradient-to-r from-green-400 to-emerald-500'
    }
    return result_bg
}

export const get_gpa = (n: number) => {
    if (n === 0 ) {
        return 'N/A'
    }
    // return n.toFixed(1)
    if (n >= 4.7) {
        return 'A'
    }
    if (n >= 4.3) {
        return 'A-'
    }
    if (n >= 4.0) {
        return 'B+'
    }
    if (n >= 3.7) {
        return 'B'
    }
    if (n >= 3.3) {
        return 'B-'
    }
    if (n >= 3.0) {
        return 'C+'
    }
    if (n >= 2.7) {
        return 'C'
    }
    if (n >= 2.3) {
        return 'C-'
    }
    if (n >= 2.0) {
        return 'D+'
    }
    if (n >= 1.7) {
        return 'D'
    }
    if (n >= 1.3) {
        return 'D-'
    }
    if (n > 0) {
        return 'F'
    }
    return "N/A"
}

export const ua_check = (ua: string) => {
    return (
        ua.indexOf(" Mobile/") > 0 &&
        ua.indexOf(" Safari/") === -1
    ) || (
            ua.indexOf("Android") > 0 &&
            ua.indexOf(" wv") > 0
        );
}

export const uuid = () => {
    // 随机生成英文字母
    const randomLetter = String.fromCharCode(Math.round(Math.random() * 25) + 65);
    return randomLetter + Date.now().toString(36);
};

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
