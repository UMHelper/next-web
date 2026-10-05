import type { Metadata } from 'next'
import LegalContent from '@/components/legal-content'
import type { LegalSection } from '@/lib/legal'
import { termsOfService } from '@/lib/terms-of-service'

export const metadata: Metadata = {
    title: 'Terms of Service | What2Reg @ UM',
    description: 'Terms of Service for What2Reg @ UM, a course review platform for University of Macau students.',
    alternates: {
        canonical: '/terms-of-service',
        languages: {
            en: '/terms-of-service',
            'zh-Hant': '/terms-of-service/zh',
        },
    },
}

/**
 * 插件（ChatGPT / Codex）相關條款。
 *
 * 正文沿用 `lib/terms-of-service.ts` 的既有章節，這裡只追加 MCP 服務的使用規則、
 * 撤銷授權／刪除帳戶與第三方平台條款段落。
 */
const PLUGIN_UPDATED_DATE = '2026-10-05'

const pluginSections: LegalSection[] = [
    {
        heading: '13. What2Reg @ UM Plugin and MCP Service',
        paragraphs: [
            'The Website also provides a read-only plugin for ChatGPT and Codex through our Model Context Protocol (MCP) endpoint at https://umeh.top/mcp. Your use of the plugin forms part of your use of the Website and remains subject to these Terms.',
            'Using the plugin requires a valid OAuth authorization carrying the umhelper:read scope. ChatGPT or Codex send the queries you explicitly type, together with an OAuth identifier, to What2Reg @ UM for authentication and rate limiting. The plugin returns public course details, instructor details, course reviews and class sections only; it never returns email addresses, private metadata, commenter identities or personal timetables, and it cannot create, edit or delete any content.',
            'You must not attempt to bypass authentication, escalate scope, exceed rate limits, or use the plugin to scrape, bulk-export or resell data. We may suspend or revoke plugin access that violates these Terms or that threatens the availability or security of the service.',
            'Course and instructor information and reviews are made available by the Website and its users on an "as is" basis and are not official statements of the University of Macau. Reviews are personal opinions rather than official conclusions; please open the linked page on https://umeh.top before relying on any fact.',
        ],
    },
    {
        heading: '14. Revoking Access, Account Deletion and Reporting Problems',
        paragraphs: ['You can stop plugin access at any time:'],
        bullets: [
            "Revoke the plugin's OAuth authorization from your Clerk account settings or from the connected-app settings of ChatGPT or Codex; the token stops working immediately.",
            'Uninstall or disable the plugin in ChatGPT or Codex, or stop using the Website, to end your acceptance of these Terms for future use.',
            'To delete your account and associated personal data, contact us through the feedback form linked at the bottom of this page.',
            'To report a plugin problem — incorrect course data, missing results, or sign-in and rate-limit errors — use the feedback form or open an issue at https://github.com/UMHelper/next-web/issues. Never include OAuth tokens or passwords in a report.',
            'We may suspend or terminate plugin access that we believe violates these Terms or applicable law.',
        ],
    },
    {
        heading: '15. Third-Party Platform Terms',
        paragraphs: [
            'Your use of ChatGPT or Codex is governed by OpenAI\'s own terms: OpenAI Terms of Use (https://openai.com/policies/terms-of-use) and OpenAI Privacy Policy (https://openai.com/policies/privacy-policy). Authentication is provided by Clerk (https://clerk.com/legal/privacy).',
            'We are not responsible for the content, availability or privacy practices of these third-party platforms, and these Terms do not replace the terms you accepted with them.',
        ],
    },
]

const TermsOfServicePage = () => {
    return (
        <LegalContent
            content={{
                ...termsOfService.en,
                updatedDate: PLUGIN_UPDATED_DATE,
                sections: [...termsOfService.en.sections, ...pluginSections],
                contactHeading: '16. Contact Us',
            }}
            switchHref='/terms-of-service/zh'
            switchLabel='閱讀中文版本'
        />
    )
}

export default TermsOfServicePage
