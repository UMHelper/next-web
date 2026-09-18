import type { LegalContent, LegalLanguage } from './legal'

export const privacyPolicy: Record<LegalLanguage, LegalContent> = {
    zh: {
        title: '隱私政策',
        updatedLabel: '最後更新日期：',
        updatedDate: '2025-08-22',
        intro:
            '歡迎使用 What2Reg @ UM 澳大選咩課（以下簡稱「本網站」）。我們重視您的私隱，並承諾以透明、負責任的方式處理個人資料。本隱私政策說明我們如何收集、使用、保存及保護您的資訊。',
        sections: [
            {
                heading: '1. 適用範圍',
                paragraphs: [
                    '本政策適用於本網站提供的課程評價、搜尋、時間表模擬及相關功能。本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。',
                ],
            },
            {
                heading: '2. 我們收集的資料',
                bullets: [
                    '帳戶資料：當您透過第三方身份驗證服務（如 Clerk）登入時，我們可能取得您的姓名、電郵地址及頭像等基本資料。',
                    '使用資料：當您瀏覽或使用本網站時，系統可能自動記錄瀏覽器類型、裝置資訊、IP 位址、瀏覽時間及操作紀錄等。',
                    '您主動提供的內容：例如您提交的課程評價、意見回饋、問題回報等。',
                ],
            },
            {
                heading: '3. 我們如何使用資料',
                bullets: [
                    '提供、維護及改善本網站的功能與服務。',
                    '驗證使用者身份及管理登入狀態。',
                    '回應您的查詢、回饋或問題回報。',
                    '進行統計分析，以了解使用趨勢及改善使用者體驗。',
                ],
            },
            {
                heading: '4. Cookies 及類似技術',
                paragraphs: [
                    '本網站可能使用 Cookies 或類似技術以維持登入狀態、記住偏好及分析網站流量。您可透過瀏覽器設定管理或刪除 Cookies，但部分功能可能因此無法正常運作。',
                ],
            },
            {
                heading: '5. 第三方服務',
                paragraphs: ['為提供服務，本網站可能與下列第三方服務分享必要資料：'],
                bullets: [
                    'Clerk：身份驗證及使用者管理。',
                    'Supabase：資料儲存及後端服務。',
                    'Google Tag Manager / Google Analytics：流量分析。',
                    'Google Forms：意見回饋及問題回報。',
                ],
            },
            {
                heading: '6. 資料分享',
                paragraphs: [
                    '除上述第三方服務、法律要求或為保護本網站及使用者的合法權益外，我們不會向其他第三方出售、出租或分享您的個人資料。',
                ],
            },
            {
                heading: '7. 資料保留與安全',
                paragraphs: [
                    '我們只會在達成收集目的所需期間內保留個人資料，並採取合理措施防止資料遺失、濫用或未經授權存取。惟請注意，任何互聯網傳輸方式均無法保證百分之百安全。',
                ],
            },
            {
                heading: '8. 您的權利',
                paragraphs: [
                    '在適用法律許可的範圍內，您有權查閱、更正、刪除您的個人資料，或撤回相關同意。如需行使上述權利，請透過下方聯絡方式與我們聯繫。',
                ],
            },
            {
                heading: '9. 未成年人',
                paragraphs: [
                    '本網站並非針對未成年人設計。若您是未成年人，請在監護人陪同下使用本網站，並由監護人閱讀及同意本隱私政策。',
                ],
            },
            {
                heading: '10. 政策變更',
                paragraphs: [
                    '我們可能不時更新本隱私政策，更新版本將於本頁面公佈。重大變更時，我們會以合理方式通知使用者。',
                ],
            },
        ],
        contactHeading: '11. 聯絡我們',
        contactPrefix: '如對本隱私政策有任何疑問，請透過 ',
        contactSuffix: ' 與我們聯繫。',
        contactLinkText: '意見回饋表單',
    },
    en: {
        title: 'Privacy Policy',
        updatedLabel: 'Last updated: ',
        updatedDate: '2025-08-22',
        intro:
            'Welcome to What2Reg @ UM 澳大選咩課 ("the Website"). We value your privacy and are committed to handling personal data in a transparent and responsible manner. This Privacy Policy explains how we collect, use, store and protect your information.',
        sections: [
            {
                heading: '1. Scope',
                paragraphs: [
                    'This policy applies to the course reviews, search, timetable simulation and related features provided by the Website. The Website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.',
                ],
            },
            {
                heading: '2. Information We Collect',
                bullets: [
                    'Account information: when you sign in through a third-party authentication service (such as Clerk), we may receive basic profile information such as your name, email address and avatar.',
                    'Usage information: when you browse or use the Website, we may automatically record your browser type, device information, IP address, browsing time and interactions.',
                    'Content you provide voluntarily: for example, course reviews, feedback and problem reports that you submit.',
                ],
            },
            {
                heading: '3. How We Use Your Information',
                bullets: [
                    'To provide, maintain and improve the functions and services of the Website.',
                    'To verify user identity and manage sign-in sessions.',
                    'To respond to your enquiries, feedback or problem reports.',
                    'To perform statistical analysis to understand usage trends and improve user experience.',
                ],
            },
            {
                heading: '4. Cookies and Similar Technologies',
                paragraphs: [
                    'The Website may use cookies or similar technologies to keep you signed in, remember your preferences and analyse site traffic. You can manage or delete cookies through your browser settings, but some features may not function properly as a result.',
                ],
            },
            {
                heading: '5. Third-Party Services',
                paragraphs: ['To provide our services, the Website may share necessary data with the following third-party services:'],
                bullets: [
                    'Clerk: authentication and user management.',
                    'Supabase: data storage and backend services.',
                    'Google Tag Manager / Google Analytics: traffic analysis.',
                    'Google Forms: feedback and problem reports.',
                ],
            },
            {
                heading: '6. Information Sharing',
                paragraphs: [
                    'Except for the third-party services described above, where required by law, or where necessary to protect the legitimate rights and interests of the Website and its users, we will not sell, rent or share your personal data with other third parties.',
                ],
            },
            {
                heading: '7. Data Retention and Security',
                paragraphs: [
                    'We will retain personal data only for as long as necessary to fulfil the purposes for which it was collected, and we take reasonable measures to prevent loss, misuse or unauthorised access. Please note, however, that no method of transmission over the Internet is 100% secure.',
                ],
            },
            {
                heading: '8. Your Rights',
                paragraphs: [
                    'To the extent permitted by applicable law, you have the right to access, correct or delete your personal data, or withdraw your consent. To exercise these rights, please contact us using the details below.',
                ],
            },
            {
                heading: '9. Minors',
                paragraphs: [
                    'The Website is not designed for minors. If you are a minor, please use the Website under the supervision of a parent or guardian, and the parent or guardian should read and agree to this Privacy Policy.',
                ],
            },
            {
                heading: '10. Changes to This Policy',
                paragraphs: [
                    'We may update this Privacy Policy from time to time. The updated version will be posted on this page. For material changes, we will notify users by reasonable means.',
                ],
            },
        ],
        contactHeading: '11. Contact Us',
        contactPrefix: 'If you have any questions about this Privacy Policy, please contact us via the ',
        contactSuffix: '.',
        contactLinkText: 'feedback form',
    },
}
