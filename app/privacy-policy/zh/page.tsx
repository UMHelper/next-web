import type { Metadata, Viewport } from 'next'
import LegalContent from '@/components/legal-content'
import { privacyPolicy } from '@/lib/privacy-policy'

export const metadata: Metadata = {
    title: '隱私政策 | What2Reg @ UM 澳大選咩課',
    description: 'What2Reg @ UM 澳大選咩課的隱私政策。',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const PrivacyPolicyZhPage = () => {
    return (
        <LegalContent
            content={privacyPolicy.zh}
            switchHref='/privacy-policy'
            switchLabel='Read in English'
        />
    )
}

export default PrivacyPolicyZhPage
