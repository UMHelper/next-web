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
                本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。
            </div>
            <div className="text-center whitespace-pre-line break-words">
                如果您經由其他網站或者應用程式訪問本網站，請注意您的個人信息安全。UMHelper 團隊與本網站並不對其他網站或者應用程式的安全性與信息準確性負責。
            </div>
            {/* <div>
                This website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.
            </div> */}
        </div>
        <CsBanner />
        </>
    )
}