'use client'
import UseAnimations from "react-useanimations";
import loading from 'react-useanimations/lib/loading';

export default function NotFounfPage() {
  return(
    <div className="w-full h-screen flex justify-center items-center flex-col space-y-8">
              <div>
      <UseAnimations animation={loading} size={80} />
      </div>
      <div className="text-8xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
        Wait a minute :)
      </div>
    </div>
  )
}