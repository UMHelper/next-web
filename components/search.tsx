import Image from "next/image";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SearchForm from "@/components/search/search-form";

export default function SearchComp() {
  return (
    <div className="relative overflow-hidden">
      <Image
        src="/images/hero-1920.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="relative z-10 max-w-screen-xl mx-auto p-2">
        <div className="flex justify-between mx-2 py-10 md:py-8">
          <div className="md:flex flex-col justify-center text-white hidden space-y-2 p-6">
            <h1 className="text-5xl font-medium">What2Reg @UM</h1>
            <h1 className="text-4xl font-medium">澳大選咩課</h1>
            <br />
            <h2 className="text-base">Course review platform for University of Macau</h2>
            <h2 className="text-base">專為澳大學生而設的課程評價網站</h2>
          </div>
          <Card className="md:mx-8 md:w-96 w-full mx-0 backdrop-blur bg-transparent border-none">
            <CardHeader />
            <CardContent className="space-y-2">
              <div className="text-white">
                <CardTitle>Search Courses or Instructors</CardTitle>
                <CardDescription className="text-white/80">
                  搜尋課程或講師
                </CardDescription>
              </div>
              <SearchForm variant="hero" />
            </CardContent>
            <CardFooter className="text-xs text-white/80 flex flex-col items-start space-y-1">
              <div className="max-w-sm">
                Search by course codes/titles, or name of instructors (partial search supported)
              </div>
              <div>鍵入部分課程代碼/名稱或講師姓名</div>
              <br />
              <div>
                {process.env.NEXT_PUBLIC_CURRENT_YEAR ? process.env.NEXT_PUBLIC_CURRENT_YEAR : "2026"}/
                {Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ? process.env.NEXT_PUBLIC_CURRENT_YEAR : "2026") + 1} AY Sem{" "}
                {process.env.NEXT_PUBLIC_CURRENT_SEM ? process.env.NEXT_PUBLIC_CURRENT_SEM : "1"}
              </div>
              <div className="italic">Data Source: reg.um.edu.mo</div>
              <div className="italic">
                Last updated on:{" "}
                {process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE
                  ? process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE
                  : "2026-08-08"}
              </div>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
