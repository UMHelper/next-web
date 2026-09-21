import type { Metadata } from 'next'
import LegalContent from '@/components/legal-content'
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
