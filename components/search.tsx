import Image from "next/image";

import HeroBackground from "@/components/hero-background";
import { HomeSearch } from "@/components/home-search";
import { formatAcademicYear } from "@/lib/config/term-format";

type SearchCompProps = {
  currentYear: number;
  currentSem: number;
  databaseLastUpdate: string | null;
};

export default function SearchComp({ currentYear, currentSem, databaseLastUpdate }: SearchCompProps) {
  return (
    <div className="relative">
      <Image
        src="/images/hero-1920.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="hero-photo object-cover object-center"
      />
      <HeroBackground />
      <div className="relative z-10 mx-auto flex max-w-screen-xl flex-col items-center px-4 py-14 text-center md:py-20">
        <div className="hero-ink space-y-2 text-white">
          <h1 className="text-4xl font-medium tracking-tight md:text-6xl">What2Reg @UM</h1>
          <p className="text-2xl font-medium md:text-3xl">澳大選咩課</p>
          <p className="mx-auto max-w-2xl pt-3 text-sm text-white/80 md:text-base">
            Course reviews, instructors, and timetable planning for University of Macau.
          </p>
        </div>

        <div className="hero-card mt-10 w-full max-w-4xl md:mt-12">
          <HomeSearch />
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px] text-white/80 md:text-xs">
          <span>{formatAcademicYear(currentYear, currentSem)}</span>
          <span>Data source: reg.um.edu.mo</span>
          <span>Last updated: {databaseLastUpdate ?? "2026-08-08"}</span>
        </div>
      </div>
    </div>
  );
}
