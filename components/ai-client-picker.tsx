'use client'

import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
    AskAiIcon,
    ClaudeIcon,
    CursorIcon,
    GenericClientIcon,
    OpenAiIcon,
    VisualStudioCodeIcon,
} from '@/components/ai-client-icons'
import { Button } from '@/components/ui/button'
import type { AiClientIconId, AiOnboardingContent } from '@/lib/ai-onboarding'

type IconProps = { className?: string }

const ICONS: Record<AiClientIconId, (props: IconProps) => ReactElement> = {
    vscode: VisualStudioCodeIcon,
    cursor: CursorIcon,
    openai: OpenAiIcon,
    claude: ClaudeIcon,
    generic: GenericClientIcon,
    askai: AskAiIcon,
}

/** Matches the collapse transition below; the retaining panel is dropped after it. */
const COLLAPSE_MS = 320

/**
 * 用戶端選擇器：一開始是幾顆大圖示，點下去之後**同一組**圖示縮小，做法在下方展開。
 *
 * 幾個刻意的設計：
 * - 圖示列只有一份 DOM，大小、間距、字級都由 `compact` 切換。若改用「大格子 ↔ 小列表」
 *   兩個元件互相替換，就只能整塊淡入淡出，做不出「圖示縮小」的連續感。
 * - 所有面板都留在 HTML 裡（搜尋引擎與「複製整頁」拿得到完整步驟），但只有作用中的那個
 *   不是 `hidden`。
 * - 收回時**不能立刻把面板設成 `hidden`**：display:none 會讓內容瞬間消失，而容器高度還在
 *   從幾百 px 收向 0，看起來就是文字先閃掉、空間再慢慢收。所以多留一個 `retainedId`，
 *   讓正在收的那塊面板撐到動畫結束才卸載。
 * - 動效走站上既有的 `tailwindcss-animate`，並加上 `motion-reduce:`。
 * - 展開的內容刻意**不套外框**：站上 Card 自帶 `border` + `shadow`，但這裡是「點開才出現的
 *   一塊說明」，四邊包起來會像多開一張卡片；改用留白與字級建立層次。
 * - 步驟編號徽章是 24px、文字行高是 20px，所以要 `-mt-0.5`（往上 2px）才會與第一行
 *   文字的中心對齊；用正的 `mt-0.5` 會讓每顆徽章低 4px。
 * - 圖示列與面板之間的距離放在**面板自己**的 `mt-*`：若改成外層容器 padding，收合時
 *   高度雖是 0 卻仍會留下一條空白；margin 在 `overflow-hidden` 的 0fr 軌道裡會被裁掉。
 * - 「Ask AI」不是頁尾的另一塊，而是圖示列裡的第 6 項，面板結構與其他用戶端完全相同；
 *   它的 snippet 就是那段可貼上的 prompt。
 * - 兩欄容器都加 `min-w-0`：grid 子項預設 `min-width: auto`，長命令會把欄寬撐破，
 *   結果 `<pre>` 被外層裁掉而不是自己橫向捲動（手機上就是看不到後半行）。
 * - 品牌標誌直接放在卡片上：VS Code、Claude 保留品牌色，Cursor、OpenAI 用 `currentColor`，
 *   淺色與深色主題都看得見。
 */
export function AiClientPicker({
    content,
    initialClientId,
}: {
    content: AiOnboardingContent
    /** Set from `?app=<id>` so a specific client can be linked to and shared. */
    initialClientId?: string
}) {
    const initialId = content.clients.some((client) => client.id === initialClientId)
        ? (initialClientId as string)
        : null

    const [activeId, setActiveId] = useState<string | null>(initialId)
    const [retainedId, setRetainedId] = useState<string | null>(initialId)
    const [copied, setCopied] = useState<string | null>(null)
    const collapseTimer = useRef<number | null>(null)

    const compact = activeId !== null

    useEffect(
        () => () => {
            if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current)
        },
        [],
    )

    const select = (id: string) => {
        if (collapseTimer.current !== null) {
            window.clearTimeout(collapseTimer.current)
            collapseTimer.current = null
        }

        if (id === activeId) {
            setActiveId(null)
            // Keep the panel mounted while the container collapses, then drop it.
            collapseTimer.current = window.setTimeout(() => {
                setRetainedId(null)
                collapseTimer.current = null
            }, COLLAPSE_MS)
            return
        }

        setActiveId(id)
        setRetainedId(id)
    }

    const copy = async (text: string) => {
        try {
            await navigator.clipboard?.writeText(text)
            setCopied(text)
            window.setTimeout(() => setCopied((current) => (current === text ? null : current)), 1500)
        } catch {
            // Clipboard access can be denied (insecure context, permissions). The
            // snippet stays selectable, so there is nothing to recover from.
        }
    }

    return (
        <div>
            <div
                role='tablist'
                aria-label={content.pickLabel}
                className={`mx-auto transition-all duration-300 motion-reduce:transition-none ${
                    compact
                        ? 'flex flex-wrap items-center justify-center gap-2'
                        : 'grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
                }`}
            >
                {content.clients.map((client) => {
                    const Icon = ICONS[client.icon]
                    const isActive = client.id === activeId

                    return (
                        <button
                            key={client.id}
                            type='button'
                            role='tab'
                            id={`ai-tab-${client.id}`}
                            aria-selected={isActive}
                            aria-controls={`ai-panel-${client.id}`}
                            onClick={() => select(client.id)}
                            className={`group flex shrink-0 items-center rounded-card border bg-card text-card-foreground transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${
                                compact
                                    ? 'min-h-[44px] gap-2 px-3 py-2 hover:bg-muted'
                                    : 'col-span-1 w-full flex-col gap-3 px-3 py-6 shadow-sm hover:-translate-y-1 hover:shadow-md active:translate-y-0 sm:gap-4 sm:py-7'
                            } ${isActive ? 'border-primary shadow-md' : 'border-border'}`}
                        >
                            <span
                                className={`flex items-center justify-center transition-all duration-300 motion-reduce:transition-none ${
                                    compact ? 'h-5 w-5' : 'h-12 w-12 sm:h-14 sm:w-14'
                                }`}
                            >
                                <Icon
                                    className={`w-auto transition-all duration-300 motion-reduce:transition-none ${
                                        compact ? 'h-4 max-w-[16px]' : 'h-8 max-w-[36px] sm:h-10 sm:max-w-[44px]'
                                    }`}
                                />
                            </span>
                            <span
                                className={`whitespace-nowrap font-semibold transition-all duration-300 motion-reduce:transition-none ${
                                    compact ? 'text-xs' : 'text-sm'
                                } ${isActive ? 'text-primary' : ''}`}
                            >
                                {client.label}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* 用 grid-template-rows 0fr↔1fr 讓整塊高度自己過渡；`retainedId` 保證收起時
                內容還在，淡出與收合才會同步。 */}
            <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
                    compact ? '' : 'pointer-events-none'
                }`}
                style={{ gridTemplateRows: compact ? '1fr' : '0fr', opacity: compact ? 1 : 0 }}
            >
                <div className='overflow-hidden'>
                    {content.clients.map((client) => {
                        const isActive = client.id === activeId
                        const isRetained = !compact && client.id === retainedId
                        const Icon = ICONS[client.icon]

                        return (
                            <section
                                key={client.id}
                                id={`ai-panel-${client.id}`}
                                role='tabpanel'
                                aria-labelledby={`ai-tab-${client.id}`}
                                aria-hidden={!isActive}
                                hidden={!isActive && !isRetained}
                                className={`mt-6 sm:mt-8 ${
                                    isActive
                                        ? 'animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out fill-mode-both motion-reduce:animate-none'
                                        : ''
                                }`}
                            >
                                <div className='animate-in fade-in duration-300 fill-mode-both flex items-start gap-3 sm:gap-4'>
                                    <span className='flex h-9 w-9 shrink-0 items-center justify-center sm:h-10 sm:w-10'>
                                        <Icon className='h-7 w-auto max-w-[32px] sm:h-8 sm:max-w-[36px]' />
                                    </span>
                                    <div className='min-w-0'>
                                        <h2 className='text-lg font-bold leading-tight sm:text-xl'>
                                            {client.heading}
                                        </h2>
                                        {/* 門檻提醒用普通文字：漸層在這個站上是給「品牌名 / 極短強調詞」
                                            用的，整句套上去會蓋過內容又傷可讀性。 */}
                                        <p className='mt-1 text-sm font-medium text-muted-foreground'>
                                            {client.requirement}
                                        </p>
                                    </div>
                                </div>

                                <div className='mt-6 grid gap-x-10 gap-y-8 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
                                    <div className='min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both [animation-delay:80ms] motion-reduce:animate-none space-y-8'>
                                        {client.methods.map((method, index) => (
                                            <div key={method.label ?? index} className='space-y-4'>
                                                {method.label && (
                                                    <h3 className='text-base font-bold'>{method.label}</h3>
                                                )}
                                                <ol className='space-y-3'>
                                                    {method.steps.map((step, stepIndex) => (
                                                        <li key={step} className='flex gap-3'>
                                                            <span className='-mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground'>
                                                                {stepIndex + 1}
                                                            </span>
                                                            <span className='min-w-0 text-sm'>{step}</span>
                                                        </li>
                                                    ))}
                                                </ol>
                                                {method.href && (
                                                    <Button
                                                        asChild
                                                        className='bg-gradient-to-r from-brand-from to-brand-to text-white hover:opacity-90'
                                                    >
                                                        <a href={method.href}>{method.hrefLabel}</a>
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div className='min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both [animation-delay:160ms] motion-reduce:animate-none space-y-8'>
                                        {client.methods
                                            .filter((method) => method.snippet)
                                            .map((method, index) => (
                                                <div key={method.snippetLabel ?? index} className='space-y-2'>
                                                    <div className='flex items-baseline justify-between gap-3'>
                                                        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                                                            {method.snippetLabel}
                                                        </p>
                                                        <Button
                                                            type='button'
                                                            variant='ghost'
                                                            size='xs'
                                                            onClick={() => copy(method.snippet as string)}
                                                            className='font-medium text-brand hover:text-brand-strong'
                                                        >
                                                            {copied === method.snippet
                                                                ? content.copiedLabel
                                                                : content.copyLabel}
                                                        </Button>
                                                    </div>
                                                    <pre className='max-h-80 overflow-auto rounded-item bg-muted p-3 text-xs leading-relaxed sm:p-4'>
                                                        <code>{method.snippet}</code>
                                                    </pre>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            </section>
                        )
                    })}
                </div>
            </div>

        </div>
    )
}
