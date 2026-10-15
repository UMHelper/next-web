import type { Metadata } from 'next'
import { AiClientPicker } from '@/components/ai-client-picker'
import {
    MCP_REGISTRY_BUTTON_URL,
    MCP_REGISTRY_PUBLISHED,
    aiOnboarding,
} from '@/lib/ai-onboarding'
import { SITE_SHORT_NAME } from '@/lib/site'

export const metadata: Metadata = {
    title: `Use ${SITE_SHORT_NAME} in AI`,
    description:
        'Add the What2REG@UM MCP server to VS Code, Cursor, Claude Code, ChatGPT or Codex: setup steps, the read-only permission requested, and what data is sent and returned.',
    alternates: { canonical: '/ai' },
}

/**
 * 公開的「在 AI 工具裡使用」接入頁。
 *
 * 這是分發的唯一權威入口（見 `../docs/superpowers/specs/2026-10-15-umhelper-mcp-distribution-design.md`
 * §3.2）：README、第三方目錄與社群公告都會指向它，所以文案與連結一律來自
 * `lib/ai-onboarding.ts`，頁面本身只負責渲染。
 *
 * 版面沿用站上其他區塊的節奏（`max-w-screen-xl` + 居中標題），而不是文章式的窄欄；
 * 只有標題一行、一句說明與一排 App 圖示，其餘點開才出現。**所有步驟仍在 HTML 裡**
 * （`AiClientPicker` 以 `hidden` 切換），所以搜尋引擎與「複製整頁」都拿得到完整內容。
 * 本頁刻意只做英文版：它是安裝時讀一次的頁面，再來一份翻譯只會更吵。
 */
type AiPageProps = {
    searchParams: Promise<{ app?: string | string[] }>
}

const Page = async ({ searchParams }: AiPageProps) => {
    const { app } = await searchParams
    const initialClientId = Array.isArray(app) ? app[0] : app

    return (
        <div className='mx-auto max-w-screen-xl p-4 py-10'>
            <div className='text-center'>
                {/* 漸層只包產品名 —— 站上就是這樣用的（navbar-list 的品牌 lockup、
                    banner 的「選咩課」），整句套漸層會喧賓奪主又難讀。 */}
                <h1 className='text-3xl font-bold tracking-tight'>
                    {aiOnboarding.titleBefore}{' '}
                    <span className='bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent'>
                        {SITE_SHORT_NAME}
                    </span>{' '}
                    {aiOnboarding.titleAfter}
                </h1>
                {MCP_REGISTRY_PUBLISHED && (
                    <div className='mt-4'>
                        <a
                            href={MCP_REGISTRY_BUTTON_URL}
                            className='inline-flex bg-brand px-5 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-strong'
                        >
                            Find it in the MCP registry
                        </a>
                    </div>
                )}
            </div>

            <div className='mt-10'>
                <AiClientPicker content={aiOnboarding} initialClientId={initialClientId} />
            </div>

        </div>
    )
}

export default Page
