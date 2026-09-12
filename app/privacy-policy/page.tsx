import type { Metadata, Viewport } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
    title: 'Privacy Policy | What2Reg @ UM 澳大選咩課',
    description: 'Privacy Policy for What2Reg @ UM, a course review platform for University of Macau students.',
}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const PrivacyPolicyPage = () => {
    const lastUpdated = '2025-08-22'

    return (
        <div className='max-w-screen-xl mx-auto px-4 py-10'>
            <div className='max-w-3xl mx-auto space-y-8'>
                <div className='space-y-2'>
                    <h1 className='text-3xl font-bold tracking-tight'>隱私政策</h1>
                    <p className='text-sm text-muted-foreground'>Privacy Policy · 最後更新日期：{lastUpdated}</p>
                </div>

                <p>
                    歡迎使用 What2Reg @ UM 澳大選咩課（以下簡稱「本網站」）。我們重視您的私隱，
                    並承諾以透明、負責任的方式處理個人資料。本隱私政策說明我們如何收集、使用、保存及保護您的資訊。
                </p>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>1. 適用範圍</h2>
                    <p>
                        本政策適用於本網站提供的課程評價、搜尋、時間表模擬及相關功能。
                        本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>2. 我們收集的資料</h2>
                    <ul className='list-disc pl-6 space-y-1'>
                        <li>帳戶資料：當您透過第三方身份驗證服務（如 Clerk）登入時，我們可能取得您的姓名、電郵地址及頭像等基本資料。</li>
                        <li>使用資料：當您瀏覽或使用本網站時，系統可能自動記錄瀏覽器類型、裝置資訊、IP 位址、瀏覽時間及操作紀錄等。</li>
                        <li>您主動提供的內容：例如您提交的課程評價、意見回饋、問題回報等。</li>
                    </ul>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>3. 我們如何使用資料</h2>
                    <ul className='list-disc pl-6 space-y-1'>
                        <li>提供、維護及改善本網站的功能與服務。</li>
                        <li>驗證使用者身份及管理登入狀態。</li>
                        <li>回應您的查詢、回饋或問題回報。</li>
                        <li>進行統計分析，以了解使用趨勢及改善使用者體驗。</li>
                    </ul>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>4. Cookies 及類似技術</h2>
                    <p>
                        本網站可能使用 Cookies 或類似技術以維持登入狀態、記住偏好及分析網站流量。
                        您可透過瀏覽器設定管理或刪除 Cookies，但部分功能可能因此無法正常運作。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>5. 第三方服務</h2>
                    <p>為提供服務，本網站可能與下列第三方服務分享必要資料：</p>
                    <ul className='list-disc pl-6 space-y-1'>
                        <li>Clerk：身份驗證及使用者管理。</li>
                        <li>Supabase：資料儲存及後端服務。</li>
                        <li>Google Tag Manager / Google Analytics：流量分析。</li>
                        <li>Google Forms：意見回饋及問題回報。</li>
                    </ul>
                    <p>該等第三方服務的私隱政策及資料處理方式，請參閱其官方網站。</p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>6. 資料分享</h2>
                    <p>
                        除上述第三方服務、法律要求或為保護本網站及使用者的合法權益外，
                        我們不會向其他第三方出售、出租或分享您的個人資料。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>7. 資料保留與安全</h2>
                    <p>
                        我們只會在達成收集目的所需期間內保留個人資料，並採取合理措施防止資料遺失、濫用或未經授權存取。
                        惟請注意，任何互聯網傳輸方式均無法保證百分之百安全。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>8. 您的權利</h2>
                    <p>在適用法律許可的範圍內，您有權查閱、更正、刪除您的個人資料，或撤回相關同意。如需行使上述權利，請透過下方聯絡方式與我們聯繫。</p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>9. 未成年人</h2>
                    <p>
                        本網站並非針對未成年人設計。若您是未成年人，請在監護人陪同下使用本網站，
                        並由監護人閱讀及同意本隱私政策。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>10. 政策變更</h2>
                    <p>
                        我們可能不時更新本隱私政策，更新版本將於本頁面公佈。
                        重大變更時，我們會以合理方式通知使用者。
                    </p>
                </section>

                <section className='space-y-2'>
                    <h2 className='text-xl font-semibold'>11. 聯絡我們</h2>
                    <p>
                        如對本隱私政策有任何疑問，請透過{' '}
                        <Link
                            href='https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'
                            className='text-blue-600 underline underline-offset-2 hover:text-blue-800'
                        >
                            意見回饋表單
                        </Link>{' '}
                        與我們聯繫。
                    </p>
                </section>
            </div>
        </div>
    )
}

export default PrivacyPolicyPage
