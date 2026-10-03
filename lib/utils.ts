import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// 分数/等级的渐变色（用在 bg-clip-text 的数字上）。类名必须走语义 token：
// 原来的硬编码色阶（rose-900/fuchsia-800 等）在深色底上只有 2.09:1 / 2.43:1，
// 也就是"低绩点在深色下几乎看不见"。浅色值由 token 保持与原色阶一致，
// 深色值在 app/globals.css 的 .dark 块里定义。
export const get_bg = (n: number) => {
    let result_bg = "bg-gradient-to-r from-grade-none-from to-grade-none-to"
    if (n > 0) {
        result_bg = 'bg-gradient-to-r from-grade-low-from to-grade-low-to'
        // 1 - 2.3
    }
    if (n >= 2.3) {
        result_bg = 'bg-gradient-to-r from-grade-mid-from to-grade-mid-to'
        // 2.3 - 3.6
    }
    if (n >= 3.6) {
        result_bg = 'bg-gradient-to-r from-grade-high-from to-grade-high-to'
        // 3.6 - 5.0
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
    if (n >= 4.4) {
        return 'A-'
    }
    if (n >= 4.1) {
        return 'B+'
    }
    if (n >= 3.7) {
        return 'B'
    }
    if (n >= 3.4) {
        return 'B-'
    }
    if (n >= 3.1) {
        return 'C+'
    }
    if (n >= 2.7) {
        return 'C'
    }
    if (n >= 2.4) {
        return 'C-'
    }
    if (n >= 2.1) {
        return 'D+'
    }
    if (n >= 1.7) {
        return 'D'
    }
    if (n >= 1.4) {
        return 'D-'
    }
    if (n > 0) {
        return 'F'
    }
    return "N/A"
}

