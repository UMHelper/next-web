import type { LegalContent, LegalLanguage } from './legal'

export const termsOfService: Record<LegalLanguage, LegalContent> = {
    en: {
        title: 'Terms of Service',
        updatedLabel: 'Last updated: ',
        updatedDate: '2025-08-22',
        intro:
            'Welcome to What2Reg @ UM 澳大選咩課 ("the Website"). By accessing or using the Website, you agree to be bound by these Terms of Service ("Terms"). If you do not agree with these Terms, please do not use the Website.',
        sections: [
            {
                heading: '1. About the Website',
                paragraphs: [
                    'The Website is a student-run course review and course information platform for the University of Macau community. The Website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.',
                ],
            },
            {
                heading: '2. Eligibility',
                paragraphs: [
                    'By using the Website, you represent that you have the legal capacity to enter into these Terms. If you are a minor, you may use the Website only with the consent and supervision of a parent or legal guardian.',
                ],
            },
            {
                heading: '3. User Accounts',
                paragraphs: [
                    'Some features require you to sign in through a third-party authentication service such as Clerk. You are responsible for maintaining the confidentiality of your account and for all activities that occur under your account. Please notify us promptly if you become aware of any unauthorised use of your account.',
                ],
            },
            {
                heading: '4. User-Generated Content',
                paragraphs: [
                    'You may submit course reviews, comments and other content ("User Content"). You retain ownership of your User Content. By submitting User Content, you grant us a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, display and distribute your User Content for the purpose of operating and improving the Website.',
                ],
                bullets: [
                    'User Content must be truthful and based on your own experience.',
                    'You must not post content that is unlawful, defamatory, harassing, discriminatory, obscene, misleading or invasive of another person\'s privacy.',
                    'You must not impersonate any person or misrepresent your affiliation with any person or entity.',
                    'We may remove or modify User Content at our discretion if we believe it violates these Terms or applicable law.',
                ],
            },
            {
                heading: '5. Prohibited Conduct',
                paragraphs: ['When using the Website, you must not:'],
                bullets: [
                    'Use the Website for any unlawful purpose or in violation of any applicable law.',
                    'Attempt to gain unauthorised access to the Website, its servers, databases or other users\' accounts.',
                    'Scrape, crawl, harvest or use automated means to collect data from the Website without our prior written permission.',
                    'Interfere with or disrupt the operation, security or availability of the Website.',
                    'Upload or transmit viruses, malware or any other harmful code.',
                    'Engage in any conduct that restricts or inhibits other users from using the Website.',
                ],
            },
            {
                heading: '6. Intellectual Property',
                paragraphs: [
                    'All content, branding, design, software and other materials on the Website, excluding User Content, are owned by UMHelper or its licensors and are protected by applicable intellectual property laws. The source code of the Website is licensed under the GNU General Public License v3.0 unless otherwise stated.',
                ],
            },
            {
                heading: '7. Third-Party Services and Links',
                paragraphs: [
                    'The Website may use third-party services such as Clerk, Supabase, Google Tag Manager, Google Analytics and Google Forms, and may contain links to third-party websites. We are not responsible for the content, privacy practices or availability of any third-party service or website.',
                ],
            },
            {
                heading: '8. Disclaimer',
                paragraphs: [
                    'The Website and its content are provided on an "as is" and "as available" basis. We do not warrant that the Website will be uninterrupted, error-free or secure, or that any course review, course information or other content is accurate, complete or reliable. Your use of the Website is at your own risk.',
                ],
            },
            {
                heading: '9. Limitation of Liability',
                paragraphs: [
                    'To the fullest extent permitted by applicable law, UMHelper, its team members and contributors shall not be liable for any indirect, incidental, special, consequential or punitive damages arising out of or relating to your use of, or inability to use, the Website.',
                ],
            },
            {
                heading: '10. Termination',
                paragraphs: [
                    'We may suspend or terminate your access to the Website at any time, with or without notice, if we believe you have violated these Terms or if we decide to discontinue the Website. You may stop using the Website at any time.',
                ],
            },
            {
                heading: '11. Governing Law',
                paragraphs: [
                    'These Terms are governed by the laws of the Macao Special Administrative Region, without regard to its conflict of law principles. Any dispute arising from these Terms or the Website shall be subject to the exclusive jurisdiction of the courts of Macao.',
                ],
            },
            {
                heading: '12. Changes to These Terms',
                paragraphs: [
                    'We may update these Terms from time to time. The updated version will be posted on this page. Your continued use of the Website after any changes takes effect constitutes acceptance of the revised Terms.',
                ],
            },
        ],
        contactHeading: '13. Contact Us',
        contactPrefix: 'If you have any questions about these Terms, please contact us via the ',
        contactSuffix: '.',
        contactLinkText: 'feedback form',
    },
    zh: {
        title: '服務條款',
        updatedLabel: '最後更新日期：',
        updatedDate: '2025-08-22',
        intro:
            '歡迎使用 What2Reg @ UM 澳大選咩課（以下簡稱「本網站」）。當您存取或使用本網站，即表示您同意受本服務條款（以下簡稱「本條款」）約束。如您不同意本條款，請勿使用本網站。',
        sections: [
            {
                heading: '1. 關於本網站',
                paragraphs: [
                    '本網站是由學生營運的課程評價及課程資訊平台，服務澳門大學社群。本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。',
                ],
            },
            {
                heading: '2. 使用資格',
                paragraphs: [
                    '使用本網站即表示您聲明具有訂立本條款所需的法律行為能力。如您為未成年人，僅可在父母或法定監護人同意及監督下使用本網站。',
                ],
            },
            {
                heading: '3. 使用者帳戶',
                paragraphs: [
                    '部分功能需要您透過第三方身份驗證服務（如 Clerk）登入。您須負責妥善保管帳戶資料，並對您帳戶下發生的所有活動負責。如發現帳戶被未經授權使用，請立即通知我們。',
                ],
            },
            {
                heading: '4. 使用者產生內容',
                paragraphs: [
                    '您可提交課程評價、留言及其他內容（以下簡稱「使用者內容」）。您保留使用者內容的所有權。提交使用者內容即表示您授予我們非專屬、全球性、免版稅的授權，以營運及改善本網站為目的，託管、儲存、重製、展示及散佈您的使用者內容。',
                ],
                bullets: [
                    '使用者內容必須真實，並基於您自身的經驗。',
                    '不得發佈違法、誹謗、騷擾、歧視、猥褻、誤導或侵犯他人私隱的內容。',
                    '不得冒充任何人，或虛假陳述您與任何人士或機構的關係。',
                    '如我們認為內容違反本條款或適用法律，可自行決定移除或修改該內容。',
                ],
            },
            {
                heading: '5. 禁止行為',
                paragraphs: ['使用本網站時，您不得：'],
                bullets: [
                    '將本網站用於任何違法目的，或違反任何適用法律。',
                    '試圖未經授權存取本網站、其伺服器、資料庫或其他使用者的帳戶。',
                    '未經我們事先書面許可，以自動化方式擷取、爬取或收集本網站資料。',
                    '干擾或破壞本網站的運作、安全或可用性。',
                    '上載或傳播病毒、惡意軟件或任何其他有害程式碼。',
                    '進行任何限制或妨礙其他使用者使用本網站的行為。',
                ],
            },
            {
                heading: '6. 知識產權',
                paragraphs: [
                    '本網站上所有內容、品牌、設計、軟件及其他材料（使用者內容除外）均由 UMHelper 或其授權人擁有，並受適用知識產權法律保護。除另有註明外，本網站原始碼以 GNU General Public License v3.0 授權。',
                ],
            },
            {
                heading: '7. 第三方服務及連結',
                paragraphs: [
                    '本網站可能使用 Clerk、Supabase、Google Tag Manager、Google Analytics 及 Google Forms 等第三方服務，並可能包含第三方網站連結。我們不對任何第三方服務或網站的內容、私隱處理方式或可用性負責。',
                ],
            },
            {
                heading: '8. 免責聲明',
                paragraphs: [
                    '本網站及其內容按「現狀」及「現有」基礎提供。我們不保證本網站不會中斷、沒有錯誤或絕對安全，亦不保證任何課程評價、課程資訊或其他內容準確、完整或可靠。您使用本網站的風險由您自行承擔。',
                ],
            },
            {
                heading: '9. 責任限制',
                paragraphs: [
                    '在適用法律允許的最大範圍內，UMHelper、其團隊成員及貢獻者對因您使用或無法使用本網站而產生的任何間接、附帶、特殊、後果性或懲罰性損害概不負責。',
                ],
            },
            {
                heading: '10. 終止',
                paragraphs: [
                    '如我們認為您違反本條款，或我們決定停止提供本網站，可隨時暫停或終止您存取本網站，恕不另行通知。您亦可隨時停止使用本網站。',
                ],
            },
            {
                heading: '11. 準據法',
                paragraphs: [
                    '本條款受澳門特別行政區法律管轄，且不適用其法律衝突原則。因本條款或本網站引起的任何爭議，均受澳門法院專屬管轄。',
                ],
            },
            {
                heading: '12. 條款變更',
                paragraphs: [
                    '我們可能不時更新本條款，更新版本將於本頁面公佈。任何變更生效後，您繼續使用本網站即構成接受修訂後的條款。',
                ],
            },
        ],
        contactHeading: '13. 聯絡我們',
        contactPrefix: '如對本條款有任何疑問，請透過 ',
        contactSuffix: ' 與我們聯繫。',
        contactLinkText: '意見回饋表單',
    },
}
