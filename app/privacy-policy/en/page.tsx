import type { Metadata, Viewport } from 'next'
import PrivacyPolicyContent from '@/components/privacy-policy-content'

export const metadata: Metadata = {
    title: 'Privacy Policy | What2Reg @ UM',
    description: 'Privacy Policy for What2Reg @ UM, a course review platform for University of Macau students.',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const PrivacyPolicyEnPage = () => {
    return <PrivacyPolicyContent lang='en' />
}

export default PrivacyPolicyEnPage
