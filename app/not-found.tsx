'use client'
import Link from "next/link"
import { usePathname } from "next/navigation"

export default function NotFoundPage() {
  // get path
  const pathname = usePathname()
  return(
    <div className="w-full h-screen flex justify-center items-center flex-col space-y-8">
      <div className="text-9xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
        Oops :(
      </div>
      <div className="text-sm text-gray-400">
        The page <span className="text-gray-800">{pathname}</span> is not found!
      </div>
      <div>
        <Link href="/" className="text-blue-500 hover:underline">
          Go back to Home
        </Link>
      </div>
    </div>
  )
}