import type { Metadata } from 'next'
import LegalContent from '@/components/legal-content'
import type { LegalSection } from '@/lib/legal'
import { termsOfService } from '@/lib/terms-of-service'

export const metadata: Metadata = {
    title: '服務條款 | What2Reg @ UM 澳大選咩課',
    description: 'What2Reg @ UM 澳大選咩課的服務條款。',
    alternates: {
        canonical: '/terms-of-service/zh',
        languages: {
            en: '/terms-of-service',
            'zh-Hant': '/terms-of-service/zh',
        },
    },
}

/**
 * 插件（ChatGPT / Codex）相關條款的繁體中文版本。
 *
 * 正文沿用 `lib/terms-of-service.ts` 的既有章節，這裡只追加 MCP 服務的使用規則、
 * 撤銷授權／刪除帳戶與第三方平台條款段落。
 */
const PLUGIN_UPDATED_DATE = '2026-10-05'

const pluginSections: LegalSection[] = [
    {
        heading: '13. What2Reg @ UM 插件與 MCP 服務',
        paragraphs: [
            '本網站同時透過模型上下文協定（Model Context Protocol，MCP）端點 https://umeh.top/mcp，為 ChatGPT 及 Codex 提供唯讀插件。您使用本插件屬於使用本網站的一部分，同樣受本條款約束。',
            '使用本插件需要具備 umhelper:read 權限範圍的有效 OAuth 授權。ChatGPT 或 Codex 會將您主動輸入的查詢，連同 OAuth 標識傳送給 What2Reg @ UM，用於身分驗證及限流（rate limit）。本插件只返回公開的課程資料、教師資料、課程評價及班次；不會返回電郵地址（email）、私人中繼資料（private metadata）、評論者身分或個人課表，亦不能建立、修改或刪除任何內容。',
            '您不得試圖繞過身分驗證、提升權限範圍、超出請求上限，或利用本插件擷取、批量匯出或轉售資料。如我們認為插件使用違反本條款，或威脅服務的可用性與安全性，可暫停或撤銷其存取權限。',
            '課程與教師資料及評價由本網站及其使用者按「現狀」提供，並非澳門大學的官方陳述。評價屬個人意見而非官方結論；在依賴任何事實前，請先開啟 https://umeh.top 上的對應頁面核實。',
        ],
    },
    {
        heading: '14. 撤銷授權、刪除帳戶及回報問題',
        paragraphs: ['您可隨時終止插件的存取權限：'],
        bullets: [
            '您可在 Clerk 帳戶設定，或 ChatGPT／Codex 的已連接應用程式設定中，撤銷本插件的 OAuth 授權；權杖一經撤銷即時失效。',
            '您可在 ChatGPT 或 Codex 中移除或停用本插件，或停止使用本網站，以終止日後對本條款的接受。',
            '如需刪除您的帳戶及相關個人資料，請透過本頁下方的意見回饋表單與我們聯繫。',
            '如需回報插件問題（例如課程資料錯誤、搜尋沒有結果、登入或限流錯誤），請使用意見回饋表單，或到 https://github.com/UMHelper/next-web/issues 開立 issue。請勿在回報內容中附上 OAuth 權杖或密碼。',
            '如我們認為插件使用違反本條款或適用法律，可暫停或終止其存取權限。',
        ],
    },
    {
        heading: '15. 第三方平台條款',
        paragraphs: [
            '您對 ChatGPT 或 Codex 的使用受 OpenAI 自身條款約束：OpenAI 使用條款（https://openai.com/policies/terms-of-use）及 OpenAI 隱私政策（https://openai.com/policies/privacy-policy）。身分驗證由 Clerk 提供（https://clerk.com/legal/privacy）。',
            '我們不對上述第三方平台的內容、可用性或私隱處理方式負責，本條款亦不取代您與該等平台之間已接受的條款。',
        ],
    },
]

const TermsOfServiceZhPage = () => {
    return (
        <LegalContent
            content={{
                ...termsOfService.zh,
                updatedDate: PLUGIN_UPDATED_DATE,
                sections: [...termsOfService.zh.sections, ...pluginSections],
                contactHeading: '16. 聯絡我們',
            }}
            switchHref='/terms-of-service'
            switchLabel='Read in English'
        />
    )
}

export default TermsOfServiceZhPage
