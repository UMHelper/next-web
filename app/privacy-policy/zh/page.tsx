import type { Metadata } from 'next'
import LegalContent from '@/components/legal-content'
import type { LegalSection } from '@/lib/legal'
import { privacyPolicy } from '@/lib/privacy-policy'

export const metadata: Metadata = {
    title: '隱私政策 | What2Reg @ UM 澳大選咩課',
    description: 'What2Reg @ UM 澳大選咩課的隱私政策。',
    alternates: {
        canonical: '/privacy-policy/zh',
        languages: {
            en: '/privacy-policy',
            'zh-Hant': '/privacy-policy/zh',
        },
    },
}

/**
 * 插件（ChatGPT / Codex）相關披露的繁體中文版本。
 *
 * 正文沿用 `lib/privacy-policy.ts` 的既有章節，這裡只追加 MCP 服務的資料流、
 * 日誌與保留、撤銷授權與第三方平台政策段落。
 */
const PLUGIN_UPDATED_DATE = '2026-10-05'

const pluginSections: LegalSection[] = [
    {
        heading: '11. What2Reg @ UM 插件、ChatGPT 與 Codex',
        paragraphs: [
            '本網站同時以唯讀 OpenAI 插件形式提供服務，透過模型上下文協定（Model Context Protocol，MCP）端點 https://umeh.top/mcp 運作。當您在 ChatGPT 或 Codex 使用本插件時，這些平台會將您主動輸入的查詢，連同 OAuth 標識（您的 Clerk 使用者 ID 及 OAuth 存取權杖）傳送給 What2Reg @ UM，用於身分驗證（authentication）及限流（rate limit）。',
            'OAuth 標識僅用於確認請求來自已登入的使用者、檢查 umhelper:read 權限範圍，以及執行每位使用者的請求上限。對話本身由 ChatGPT 或 Codex 處理；本設計不要求 What2Reg @ UM 保存您的完整對話。',
            '本 MCP 服務只返回公開資料：課程資料、教師資料、課程評價及班次（class section），每項均附有返回 https://umeh.top 的連結。',
        ],
    },
    {
        heading: '12. 不會返回給模型的資料',
        paragraphs: ['本插件為唯讀服務，不會返回任何個人帳戶資料。具體而言：'],
        bullets: [
            '電郵地址（email）不會返回給模型。',
            '私人中繼資料（private metadata，包括 Clerk private metadata 及其他內部帳戶欄位）不會返回。',
            '評論者身分（包括評價作者的名稱、頭像及帳戶識別碼）不會返回。',
            '個人課表、已儲存的計劃及個人選課紀錄不會被讀取、返回或修改。',
            '內部資料庫識別碼、管理備註及審核欄位不會返回。',
        ],
    },
    {
        heading: '13. 插件日誌與資料保留',
        paragraphs: [
            '我們會為插件保留去識別化的營運日誌，用於偵測濫用、執行限流、排查故障及監控可用性。日誌內容包括請求 ID、Clerk 使用者 ID 的不可逆雜湊、工具名稱、狀態類別、耗時、返回筆數、回應是否被截斷，以及限流結果。',
            '我們不會記錄 OAuth 存取權杖、電郵地址、完整工具參數、完整評價正文或原始資料庫錯誤。OAuth 權杖由 Clerk 保管，我們的 MCP 服務不會儲存。營運日誌僅在安全與可靠性所需的期間內保留，其後即予刪除。',
        ],
    },
    {
        heading: '14. 撤銷授權、刪除帳戶及回報問題',
        paragraphs: ['您可隨時控制插件的存取權限：'],
        bullets: [
            '您可在 Clerk 帳戶設定（Manage account → Security / Connected accounts），或 ChatGPT／Codex 的已連接應用程式設定中，撤銷本插件的 OAuth 授權。授權一經撤銷，權杖即時失效。',
            '您亦可在 ChatGPT 或 Codex 中移除或停用本插件，以停止向 What2Reg @ UM 發送新請求。',
            '如需刪除您的 What2Reg @ UM 帳戶及相關個人資料，請透過本頁下方的意見回饋表單與我們聯繫。',
            '如需回報插件問題（例如課程資料錯誤、搜尋沒有結果、登入或限流錯誤），請使用意見回饋表單，或到 https://github.com/UMHelper/next-web/issues 開立 issue。請勿在回報內容中附上 OAuth 權杖或密碼。',
        ],
    },
    {
        heading: '15. 第三方平台政策',
        paragraphs: [
            '當您在 ChatGPT 或 Codex 使用本插件時，OpenAI 會依其自身政策處理您的對話及帳戶資訊：OpenAI 隱私政策（https://openai.com/policies/privacy-policy）及 OpenAI 使用條款（https://openai.com/policies/terms-of-use）。',
            '身分驗證由 Clerk 提供，請參閱 Clerk 隱私政策：https://clerk.com/legal/privacy。',
        ],
    },
]

const PrivacyPolicyZhPage = () => {
    return (
        <LegalContent
            content={{
                ...privacyPolicy.zh,
                updatedDate: PLUGIN_UPDATED_DATE,
                sections: [...privacyPolicy.zh.sections, ...pluginSections],
                contactHeading: '16. 聯絡我們',
            }}
            switchHref='/privacy-policy'
            switchLabel='Read in English'
        />
    )
}

export default PrivacyPolicyZhPage
