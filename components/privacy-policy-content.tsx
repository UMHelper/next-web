import Link from 'next/link'
import { privacyPolicy, type PrivacyLanguage } from '@/lib/privacy-policy'

const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'

const PrivacyPolicyContent = ({ lang }: { lang: PrivacyLanguage }) => {
    const t = privacyPolicy[lang]
    const switchHref = lang === 'zh' ? '/privacy-policy/en' : '/privacy-policy'
    const switchLabel = lang === 'zh' ? 'Read in English' : '閱讀中文版本'

    return (
        <div className='max-w-screen-xl mx-auto px-4 py-10'>
            <div className='max-w-3xl mx-auto space-y-8'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                    <div className='space-y-2'>
                        <h1 className='text-3xl font-bold tracking-tight'>{t.title}</h1>
                        <p className='text-sm text-muted-foreground'>
                            {t.updatedLabel} {t.updatedDate}
                        </p>
                    </div>
                    <Link
                        href={switchHref}
                        className='shrink-0 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    >
                        {switchLabel}
                    </Link>
                </div>

                <p>{t.intro}</p>

                {t.sections.map((section) => (
                    <section key={section.heading} className='space-y-2'>
                        <h2 className='text-xl font-semibold'>{section.heading}</h2>
                        {section.paragraphs?.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                        {section.bullets && (
                            <ul className='list-disc pl-6 space-y-1'>
                                {section.bullets.map((bullet) => (
                                    <li key={bullet}>{bullet}</li>
                                ))}
                            </ul>
                        )}
                    </section>
                ))}

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>{t.contactHeading}</h2>
                    <p>
                        {t.contactPrefix}
                        <Link
                            href={FEEDBACK_FORM_URL}
                            className='text-blue-600 underline underline-offset-2 hover:text-blue-800'
                        >
                            {t.contactLinkText}
                        </Link>
                        {t.contactSuffix}
                    </p>
                </section>
            </div>
        </div>
    )
}

export default PrivacyPolicyContent
