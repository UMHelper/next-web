import type { Metadata } from 'next'
import Link from 'next/link'
import LegalContent from '@/components/legal-content'
import { FEEDBACK_FORM_URL, type LegalContent as LegalPageContent } from '@/lib/legal'

export const metadata: Metadata = {
    title: 'Plugin Support | What2Reg @ UM',
    description:
        'Support for the What2Reg @ UM ChatGPT and Codex plugin: support channels, what data is sent and returned, revoking OAuth authorization, deleting your account, reporting problems and third-party policies.',
    alternates: {
        canonical: '/support',
        languages: {
            en: '/support',
            'zh-Hant': '/support?lang=zh',
        },
    },
}

/**
 * 公開插件支援頁。
 *
 * OpenAI 插件目錄把 `https://umeh.top/support` 當作 listing 的 support URL，
 * MCP 的 OAuth metadata 亦以它作 `resource_documentation`（見 Task 10 規格）。
 * 因此本頁必須匿名可達，沿用法律頁的元件與版面（`components/legal-content.tsx`），
 * 並以 `?lang=zh` 切換繁體中文，不另建 /support/zh 路由。
 */
const SUPPORT_UPDATED_DATE = '2026-10-05'

const supportEn: LegalPageContent = {
    title: 'Plugin Support',
    updatedLabel: 'Last updated: ',
    updatedDate: SUPPORT_UPDATED_DATE,
    intro:
        'What2Reg @ UM 澳大選咩課 is a student-run course review and course information platform for the University of Macau. It offers a read-only plugin for ChatGPT and Codex through the Model Context Protocol (MCP) endpoint at https://umeh.top/mcp. This page explains how to get help, how the plugin handles your data, and how to revoke or delete your access.',
    sections: [
        {
            heading: '1. What the Plugin Does',
            paragraphs: [
                'The plugin lets ChatGPT and Codex answer questions about University of Macau courses, instructors, course reviews and class sections. It is read-only: it cannot post reviews, vote, change your timetable or read your profile.',
                'Course and instructor information and reviews come from the Website and its users. Reviews are personal opinions and are not official statements of the University of Macau; always open the linked page on https://umeh.top before relying on a fact.',
            ],
        },
        {
            heading: '2. Support Channels',
            bullets: [
                'Feedback form — our main support channel for plugin questions, account deletion requests and problem reports. The link is listed under Related Links below.',
                'GitHub issues — report plugin bugs or data problems publicly at https://github.com/UMHelper/next-web/issues.',
                'Please never include OAuth tokens, passwords or other credentials in a support request.',
            ],
        },
        {
            heading: '3. What Is Sent to What2Reg @ UM and What Is Returned',
            paragraphs: [
                'When you use the plugin, ChatGPT or Codex send the queries you explicitly type, together with an OAuth identifier (your Clerk user ID and OAuth access token), to What2Reg @ UM. We use that identifier only to authenticate you and to apply rate limits.',
                'The service returns public course details, instructor details, course reviews and class sections. It does not return email addresses, private metadata, commenter identities or personal timetables, and it does not require What2Reg @ UM to store your full conversation.',
            ],
        },
        {
            heading: "4. Revoking the Plugin's OAuth Authorization",
            bullets: [
                'Revoke the OAuth authorization from your Clerk account settings (Manage account → Security / Connected accounts) or from the connected-app settings of ChatGPT or Codex. A revoked token stops working immediately.',
                'You can also uninstall or disable the plugin in ChatGPT or Codex to stop new requests from being sent.',
                'Signing in to the plugin again later creates a new authorization that you can revoke in the same way.',
            ],
        },
        {
            heading: '5. Deleting Your Account',
            paragraphs: [
                'To delete your account and the personal data associated with it, send a request through the feedback form listed under Related Links. Account deletion removes your profile and sign-in identity from our systems.',
                'Reviews and other content you submitted may remain in anonymised form, and we may retain limited records where we are required to do so by law or for security purposes.',
            ],
        },
        {
            heading: '6. Reporting a Plugin Problem',
            paragraphs: ['Please tell us about any of the following through the feedback form or GitHub issues:'],
            bullets: [
                'Incorrect, outdated or missing course, instructor, review or class-section data.',
                'Sign-in, authorization or scope failures when connecting the plugin.',
                'Rate-limit errors, timeouts or unexpectedly truncated results.',
                'Any output that appears to expose personal data or internal information.',
            ],
        },
        {
            heading: '7. Logging, Retention and Third-Party Policies',
            paragraphs: [
                'Operational logs for the plugin record the request ID, an irreversible hash of the Clerk user ID, the tool name, the status category, latency, result counts, whether a response was truncated and the rate-limit outcome. They never contain OAuth tokens, email addresses, full tool arguments, full review text or raw database errors, and they are retained only for as long as needed for security and reliability.',
                'ChatGPT and Codex are operated by OpenAI, and your conversation is governed by OpenAI policies: OpenAI Terms of Use at https://openai.com/policies/terms-of-use and OpenAI Privacy Policy at https://openai.com/policies/privacy-policy. Authentication is provided by Clerk; see https://clerk.com/legal/privacy.',
                'Our own rules are in the Privacy Policy (https://umeh.top/privacy-policy) and the Terms of Service (https://umeh.top/terms-of-service).',
            ],
        },
    ],
    contactHeading: '8. Contact Us',
    contactPrefix: 'For any question about the plugin, use the ',
    contactSuffix: '.',
    contactLinkText: 'feedback form',
}

const supportZh: LegalPageContent = {
    title: '插件技術支援',
    updatedLabel: '最後更新日期：',
    updatedDate: SUPPORT_UPDATED_DATE,
    intro:
        'What2Reg @ UM 澳大選咩課是由學生營運的課程評價及課程資訊平台，服務澳門大學社群。本網站透過模型上下文協定（Model Context Protocol，MCP）端點 https://umeh.top/mcp，為 ChatGPT 及 Codex 提供唯讀插件。本頁說明如何取得支援、插件如何處理您的資料，以及如何撤銷或刪除您的存取權限。',
    sections: [
        {
            heading: '1. 插件功能',
            paragraphs: [
                '本插件讓 ChatGPT 及 Codex 回答有關澳門大學課程、教師、課程評價及班次的問題。插件為唯讀服務：不能發表評價、投票、修改您的課表，亦不能讀取您的個人資料。',
                '課程與教師資料及評價來自本網站及其使用者。評價屬個人意見，並非澳門大學的官方陳述；在依賴任何事實前，請先開啟 https://umeh.top 上的對應頁面核實。',
            ],
        },
        {
            heading: '2. 支援管道',
            bullets: [
                '意見回饋表單——插件查詢、刪除帳戶請求及問題回報的主要支援管道，連結見下方「相關連結」。',
                'GitHub issues——可在 https://github.com/UMHelper/next-web/issues 公開回報插件錯誤或資料問題。',
                '請勿在支援請求中附上 OAuth 權杖、密碼或其他憑證。',
            ],
        },
        {
            heading: '3. 傳送給 What2Reg @ UM 及返回的資料',
            paragraphs: [
                '當您使用本插件時，ChatGPT 或 Codex 會將您主動輸入的查詢，連同 OAuth 標識（您的 Clerk 使用者 ID 及 OAuth 存取權杖）傳送給 What2Reg @ UM。我們僅將該標識用於身分驗證及限流（rate limit）。',
                '本服務只返回公開的課程資料、教師資料、課程評價及班次。不會返回電郵地址（email）、私人中繼資料（private metadata）、評論者身分或個人課表，本設計亦不要求 What2Reg @ UM 保存您的完整對話。',
            ],
        },
        {
            heading: '4. 撤銷插件的 OAuth 授權',
            bullets: [
                '您可在 Clerk 帳戶設定（Manage account → Security / Connected accounts），或 ChatGPT／Codex 的已連接應用程式設定中撤銷 OAuth 授權；權杖一經撤銷即時失效。',
                '您亦可在 ChatGPT 或 Codex 中移除或停用本插件，以停止發送新請求。',
                '日後再次登入插件會建立新的授權，您可以同樣方式撤銷。',
            ],
        },
        {
            heading: '5. 刪除帳戶',
            paragraphs: [
                '如需刪除帳戶及相關個人資料，請透過下方「相關連結」中的意見回饋表單提出請求。刪除帳戶後，您的個人資料及登入身分會從我們的系統移除。',
                '您曾提交的評價及其他內容可能以匿名形式保留；如法律要求或為安全目的，我們亦可能保留有限紀錄。',
            ],
        },
        {
            heading: '6. 回報插件問題',
            paragraphs: ['如遇到以下情況，請透過意見回饋表單或 GitHub issues 通知我們：'],
            bullets: [
                '課程、教師、評價或班次資料錯誤、過時或缺失。',
                '連接插件時出現登入、授權或權限範圍錯誤。',
                '限流錯誤、逾時或結果被異常截斷。',
                '任何疑似洩露個人資料或內部資訊的輸出。',
            ],
        },
        {
            heading: '7. 日誌、資料保留及第三方政策',
            paragraphs: [
                '插件營運日誌記錄請求 ID、Clerk 使用者 ID 的不可逆雜湊、工具名稱、狀態類別、耗時、返回筆數、回應是否被截斷及限流結果。日誌不含 OAuth 權杖、電郵地址、完整工具參數、完整評價正文或原始資料庫錯誤，並僅在安全與可靠性所需的期間內保留。',
                'ChatGPT 及 Codex 由 OpenAI 營運，您的對話受 OpenAI 政策約束：OpenAI 使用條款 https://openai.com/policies/terms-of-use 及 OpenAI 隱私政策 https://openai.com/policies/privacy-policy。身分驗證由 Clerk 提供，請參閱 https://clerk.com/legal/privacy。',
                '本網站自身的規則載於隱私政策（https://umeh.top/privacy-policy）及服務條款（https://umeh.top/terms-of-service）。',
            ],
        },
    ],
    contactHeading: '8. 聯絡我們',
    contactPrefix: '如對插件有任何疑問，請使用 ',
    contactSuffix: '與我們聯繫。',
    contactLinkText: '意見回饋表單',
}

type RelatedLink = {
    label: string
    href: string
}

const RELATED_LINKS: ReadonlyArray<RelatedLink> = [
    { label: 'What2Reg @ UM — https://umeh.top', href: 'https://umeh.top' },
    { label: 'Support — https://umeh.top/support', href: '/support' },
    { label: 'Privacy Policy — https://umeh.top/privacy-policy', href: '/privacy-policy' },
    { label: 'Terms of Service — https://umeh.top/terms-of-service', href: '/terms-of-service' },
    { label: 'Feedback form', href: FEEDBACK_FORM_URL },
    { label: 'GitHub issues — https://github.com/UMHelper/next-web/issues', href: 'https://github.com/UMHelper/next-web/issues' },
    { label: 'OpenAI Privacy Policy', href: 'https://openai.com/policies/privacy-policy' },
    { label: 'OpenAI Terms of Use', href: 'https://openai.com/policies/terms-of-use' },
    { label: 'Clerk Privacy Policy', href: 'https://clerk.com/legal/privacy' },
]

type SupportPageProps = {
    searchParams: Promise<{ lang?: string | string[] }>
}

const SupportPage = async ({ searchParams }: SupportPageProps) => {
    const { lang } = await searchParams
    const isTraditionalChinese = (Array.isArray(lang) ? lang[0] : lang) === 'zh'

    return (
        <>
            <LegalContent
                content={isTraditionalChinese ? supportZh : supportEn}
                switchHref={isTraditionalChinese ? '/support' : '/support?lang=zh'}
                switchLabel={isTraditionalChinese ? 'Read in English' : '閱讀中文版本'}
            />
            <div className='max-w-screen-xl mx-auto px-4 pb-10'>
                <div className='max-w-3xl mx-auto space-y-2'>
                    <h2 className='text-xl font-semibold'>
                        {isTraditionalChinese ? '相關連結' : 'Related Links'}
                    </h2>
                    <ul className='list-disc pl-6 space-y-1'>
                        {RELATED_LINKS.map((link) => (
                            <li key={link.href}>
                                <Link
                                    href={link.href}
                                    className='text-brand underline underline-offset-2 hover:text-brand-strong'
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </>
    )
}

export default SupportPage
