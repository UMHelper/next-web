"use client"

// import RotatingText from "@/components/RotatingText/RotatingText"
import CsBanner from "@/components/cs-banner"

export const Banner = () => {
    return (
        <>
        <div className='w-full px-1 py-2 flex flex-col justify-center items-center bg-slate-100 text-slate-800 text-xs space-y-1'>
            {/* <RotatingText
                texts={['本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。', 'This website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.',]}
                mainClassName="text-black overflow-hidden justify-center items-center"
                staggerFrom={"last"}
                staggerDuration={0.005}
                splitLevelClassName="overflow-hidden text-center"
                transition={{ type: "spring", damping: 30, stiffness: 400 }}
                rotationInterval={6000}
                /> */}
            <div>
                <span className="whitespace-nowrap bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">選咩課</span> 開發團隊 UMHelper 現有成員已於2026年全部畢業。我們無法保證後續的網站維護與更新。
            </div>
            <div className="text-center whitespace-pre-line break-words">
                我們歡迎任何背景的在校學生接手後續的維護，請聯繫 <a href="mailto:umacauhelper@gmail.com" className="whitespace-nowrap bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent underline">
                    我們的郵箱
                </a>
            </div>
            {/* <div>
                This website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.
            </div> */}
        </div>
        <CsBanner />
        </>
    )
}