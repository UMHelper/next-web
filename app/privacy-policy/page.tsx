import type { Metadata } from 'next'
import LegalContent from '@/components/legal-content'
import type { LegalSection } from '@/lib/legal'
import { privacyPolicy } from '@/lib/privacy-policy'

export const metadata: Metadata = {
    title: 'Privacy Policy | What2Reg @ UM',
    description: 'Privacy Policy for What2Reg @ UM, a course review platform for University of Macau students.',
    alternates: {
        canonical: '/privacy-policy',
        languages: {
            en: '/privacy-policy',
            'zh-Hant': '/privacy-policy/zh',
        },
    },
}

/**
 * 插件（ChatGPT / Codex）相關披露。
 *
 * 正文沿用 `lib/privacy-policy.ts` 的既有章節，這裡只追加 MCP 服務的資料流、
 * 日誌與保留、撤銷授權與第三方平台政策段落，不另建一套法律頁版面。
 */
const PLUGIN_UPDATED_DATE = '2026-10-05'

const pluginSections: LegalSection[] = [
    {
        heading: '11. What2Reg @ UM Plugin, ChatGPT and Codex',
        paragraphs: [
            'What2Reg @ UM 澳大選咩課 is also available as a read-only OpenAI plugin through our Model Context Protocol (MCP) endpoint at https://umeh.top/mcp. When you use the plugin inside ChatGPT or Codex, those platforms send the queries you explicitly type, together with an OAuth identifier (your Clerk user ID and OAuth access token), to What2Reg @ UM so that we can authenticate you and apply rate limits.',
            'The OAuth identifier is used only to confirm that a request comes from a signed-in user, to check the umhelper:read scope and to enforce per-user rate limits. The conversation itself is handled by ChatGPT or Codex; this design does not require What2Reg @ UM to store your full conversation.',
            'Our MCP service returns public information only: course details, instructor details, course reviews and class sections, each with a link back to https://umeh.top.',
        ],
    },
    {
        heading: '12. Information Never Returned to the Model',
        paragraphs: [
            'The plugin is read-only and returns no personal account data. In particular:',
        ],
        bullets: [
            'Email addresses are never returned to the model.',
            'Private metadata (including Clerk private metadata and other internal account fields) is never returned.',
            'Commenter identities — the names, avatars and account identifiers of review authors — are never returned.',
            'Personal timetables, saved plans and personal course selections are never read, returned or modified.',
            'Internal database identifiers, administrative notes and moderation fields are never returned.',
        ],
    },
    {
        heading: '13. Plugin Logging and Data Retention',
        paragraphs: [
            'We keep privacy-preserving operational logs for the plugin in order to detect abuse, enforce rate limits, debug failures and monitor availability. These logs contain the request ID, an irreversible hash of the Clerk user ID, the tool name, the status category, latency, the number of results, whether a response was truncated and the rate-limit outcome.',
            'We do not log OAuth access tokens, email addresses, full tool arguments, full review text or raw database errors. OAuth tokens stay with Clerk and are never stored by our MCP service. Operational logs are retained only for as long as needed for security and reliability, and are then deleted.',
        ],
    },
    {
        heading: '14. Revoking Access, Deleting Your Account and Reporting Problems',
        paragraphs: ['You stay in control of the plugin at all times:'],
        bullets: [
            "Revoke the plugin's OAuth authorization from your Clerk account settings (Manage account → Security / Connected accounts) or from the connected-app settings of ChatGPT or Codex. A revoked token stops working immediately.",
            'Uninstall or disable the plugin in ChatGPT or Codex to stop new requests from being sent to What2Reg @ UM.',
            'To delete your What2Reg @ UM account and the personal data associated with it, contact us through the feedback form linked at the bottom of this page.',
            'To report a plugin problem — incorrect course data, missing results, or sign-in and rate-limit errors — use the feedback form or open an issue at https://github.com/UMHelper/next-web/issues. Please never include OAuth tokens or passwords in a report.',
        ],
    },
    {
        heading: '15. Third-Party Platform Policies',
        paragraphs: [
            'When you use the plugin inside ChatGPT or Codex, OpenAI processes your conversation and account information under its own policies: OpenAI Privacy Policy (https://openai.com/policies/privacy-policy) and OpenAI Terms of Use (https://openai.com/policies/terms-of-use).',
            'Authentication is provided by Clerk; see the Clerk Privacy Policy at https://clerk.com/legal/privacy.',
        ],
    },
]

const PrivacyPolicyPage = () => {
    return (
        <LegalContent
            content={{
                ...privacyPolicy.en,
                updatedDate: PLUGIN_UPDATED_DATE,
                sections: [...privacyPolicy.en.sections, ...pluginSections],
                contactHeading: '16. Contact Us',
            }}
            switchHref='/privacy-policy/zh'
            switchLabel='閱讀中文版本'
        />
    )
}

export default PrivacyPolicyPage
