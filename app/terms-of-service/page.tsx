import type { Metadata, Viewport } from 'next'
import LegalContent from '@/components/legal-content'
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

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const TermsOfServicePage = () => {
    return (
        <LegalContent
            content={termsOfService.en}
            switchHref='/terms-of-service/zh'
            switchLabel='閱讀中文版本'
        />
    )
}

export default TermsOfServicePage
