import Link from 'next/link'
import { FEEDBACK_FORM_URL, type LegalContent } from '@/lib/legal'

type LegalContentProps = {
    content: LegalContent
    switchHref: string
    switchLabel: string
}

const LegalContent = ({ content, switchHref, switchLabel }: LegalContentProps) => {
    return (
        <div className='max-w-screen-xl mx-auto px-4 py-10'>
            <div className='max-w-3xl mx-auto space-y-8'>
                <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
                    <div className='space-y-2'>
                        <h1 className='text-3xl font-bold tracking-tight'>{content.title}</h1>
                        <p className='text-sm text-muted-foreground'>
                            {content.updatedLabel}{content.updatedDate}
                        </p>
                    </div>
                    <Link
                        href={switchHref}
                        className='shrink-0 rounded-full border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'
                    >
                        {switchLabel}
                    </Link>
                </div>

                <p>{content.intro}</p>

                {content.sections.map((section) => (
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
                    <h2 className='text-xl font-semibold'>{content.contactHeading}</h2>
                    <p>
                        {content.contactPrefix}
                        <Link
                            href={FEEDBACK_FORM_URL}
                            className='text-blue-600 underline underline-offset-2 hover:text-blue-800'
                        >
                            {content.contactLinkText}
                        </Link>
                        {content.contactSuffix}
                    </p>
                </section>
            </div>
        </div>
    )
}

export default LegalContent
