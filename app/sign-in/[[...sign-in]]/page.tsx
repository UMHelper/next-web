import { SignIn } from "@clerk/nextjs";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = { title: "Sign In", ...noIndexMetadata };

export default function Page() {
    return (
        <div className="w-full h-screen flex justify-center items-center">
            <SignIn />
        </div>
    );
}