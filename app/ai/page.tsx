import type { Metadata } from 'next'
import Link from 'next/link'
import {
    MCP_PUBLIC_URL,
    MCP_REGISTRY_BUTTON_URL,
    MCP_REGISTRY_PUBLISHED,
    aiOnboardingEn,
    aiOnboardingZh,
    type AiOnboardingContent,
} from '@/lib/ai-onboarding'
import { SITE_NAME } from '@/lib/site'

export const metadata: Metadata = {
    title: `Use ${SITE_NAME} in your AI tools`,
    description:
        'Add the What2REG@UM (UMHelper) MCP server to VS Code, Cursor, Claude Code, ChatGPT or Codex: setup steps, the read-only permission requested, and what data is sent and returned.',
    alternates: {
        canonical: '/ai',
        languages: {
            en: '/ai',
            'zh-Hant': '/ai?lang=zh',
        },
    },
}

/**
 * 公開的「在 AI 工具裡使用」接入頁。
 *
 * 這是分發的唯一權威入口（見 `../docs/superpowers/specs/2026-10-15-umhelper-mcp-distribution-design.md`
 * §3.2）：README、第三方目錄與社群公告都會指向它，所以文案與連結一律來自
 * `lib/ai-onboarding.ts`，頁面本身只負責渲染。
 *
 * 兩個刻意的設計：
 * - 每個客戶端區塊都必須顯示「前置條件」。ChatGPT 與 Codex 需要付費方案，不能讓同學
 *   照著做完才發現要付錢（spec §3.4）。
 * - 只有 `MCP_REGISTRY_PUBLISHED` 為 true 時才顯示 registry 指標按鈕，避免指向還不存在的
 *   目錄條目（spec §9 U1）。
 */
const AiOnboardingPage = ({ content }: { content: AiOnboardingContent }) => {
    return (
        <div className='max-w-screen-xl mx-auto px-4 py-10'>
            <div className='max-w-3xl mx-auto space-y-8'>
                <div>
                    <h1 className='text-3xl font-bold tracking-tight'>{content.title}</h1>
                    <p className='mt-2 text-sm text-muted-foreground'>
                        {content.updatedLabel}
                        {content.updatedDate}
                    </p>
                </div>

                <p>{content.intro}</p>

                {MCP_REGISTRY_PUBLISHED && (
                    <a
                        href={MCP_REGISTRY_BUTTON_URL}
                        className='inline-flex rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-strong'
                    >
                        {content.clientsHeading === 'Choose your tool'
                            ? 'Find it in the MCP registry'
                            : '在 MCP registry 中尋找'}
                    </a>
                )}

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>{content.clientsHeading}</h2>
                </section>

                {content.clients.map((client) => (
                    <section key={client.id} className='rounded-lg border border-border-strong p-4 space-y-3'>
                        <h3 className='text-lg font-semibold'>{client.heading}</h3>
                        <p className='rounded-md bg-muted px-3 py-2 text-sm'>{client.requirement}</p>
                        <ol className='list-decimal pl-6 space-y-1'>
                            {client.steps.map((step) => (
                                <li key={step}>{step}</li>
                            ))}
                        </ol>
                        {client.snippet && (
                            <div className='space-y-1'>
                                <p className='text-sm text-muted-foreground'>{client.snippetLabel}</p>
                                <pre className='overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs'>
                                    <code>{client.snippet}</code>
                                </pre>
                            </div>
                        )}
                        {client.href && (
                            <a
                                href={client.href}
                                className='inline-flex rounded-full border border-border-strong px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted'
                            >
                                {client.hrefLabel}
                            </a>
                        )}
                    </section>
                ))}

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>{content.authHeading}</h2>
                    {content.authParagraphs.map((paragraph) => (
                        <p key={paragraph}>{paragraph}</p>
                    ))}
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>{content.dataHeading}</h2>
                    <ul className='list-disc pl-6 space-y-1'>
                        {content.dataBullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                        ))}
                    </ul>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>{content.troubleshootHeading}</h2>
                    <ul className='list-disc pl-6 space-y-1'>
                        {content.troubleshootBullets.map((bullet) => (
                            <li key={bullet}>{bullet}</li>
                        ))}
                    </ul>
                    <p>
                        <Link
                            href={content.supportHref}
                            className='text-brand underline underline-offset-2 hover:text-brand-strong'
                        >
                            {content.supportLabel}
                        </Link>
                    </p>
                </section>

                <p className='text-sm text-muted-foreground'>
                    <code>{MCP_PUBLIC_URL}</code>
                </p>
            </div>
        </div>
    )
}

type AiPageProps = {
    searchParams: Promise<{ lang?: string | string[] }>
}

const Page = async ({ searchParams }: AiPageProps) => {
    const { lang } = await searchParams
    const isTraditionalChinese = (Array.isArray(lang) ? lang[0] : lang) === 'zh'

    return (
        <>
            <div className='max-w-screen-xl mx-auto px-4 pt-6'>
                <div className='max-w-3xl mx-auto flex justify-end'>
                    <Link
                        href={isTraditionalChinese ? '/ai' : '/ai?lang=zh'}
                        className='rounded-full border border-border-strong px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted'
                    >
                        {isTraditionalChinese ? 'Read in English' : '閱讀中文版本'}
                    </Link>
                </div>
            </div>
            <AiOnboardingPage content={isTraditionalChinese ? aiOnboardingZh : aiOnboardingEn} />
        </>
    )
}

export default Page
