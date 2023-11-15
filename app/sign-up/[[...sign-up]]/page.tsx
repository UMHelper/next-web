import { SignUp } from "@clerk/nextjs";

export default function Page() {
    return (
        <div className="w-full h-screen flex flex justify-center items-center">
            <SignUp />
        </div>);
}