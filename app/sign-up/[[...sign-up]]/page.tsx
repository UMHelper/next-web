import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
            <div className="py-6 w-full h-screen flex justify-center items-center flex-col space-y-1">
                <SignUp />
                <div className="p-2 bg-red-500 rounded text-white text-center text-xs">
                    <p>Our email verification system is blocked by University of Macau,</p> 
                    <p>please use another email to sign up.</p>
                </div>
            </div>
        );
}
