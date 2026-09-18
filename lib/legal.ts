export type LegalLanguage = 'zh' | 'en'

export type LegalSection = {
    heading: string
    paragraphs?: string[]
    bullets?: string[]
}

export type LegalContent = {
    title: string
    updatedLabel: string
    updatedDate: string
    intro: string
    sections: LegalSection[]
    contactHeading: string
    contactPrefix: string
    contactSuffix: string
    contactLinkText: string
}

export const FEEDBACK_FORM_URL =
    'https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'
