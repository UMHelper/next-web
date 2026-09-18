import type { Metadata, Viewport } from 'next'
import LegalContent from '@/components/legal-content'
import { termsOfService } from '@/lib/terms-of-service'

export const metadata: Metadata = {
    title: '服務條款 | What2Reg @ UM 澳大選咩課',
    description: 'What2Reg @ UM 澳大選咩課的服務條款。',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const TermsOfServiceZhPage = () => {
    return (
        <LegalContent
            content={termsOfService.zh}
            switchHref='/terms-of-service'
            switchLabel='Read in English'
        />
    )
}

export default TermsOfServiceZhPage
