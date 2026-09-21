import type { Metadata, Viewport } from 'next'
import LegalContent from '@/components/legal-content'
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

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const PrivacyPolicyPage = () => {
    return (
        <LegalContent
            content={privacyPolicy.en}
            switchHref='/privacy-policy/zh'
            switchLabel='閱讀中文版本'
        />
    )
}

export default PrivacyPolicyPage
