import { getAppConfig } from "@/lib/config/app-config";
import supabaseServer from "@/lib/supabase/server";

type ScheduleEntry = { date: string; time: string; location: string };
type SectionEntry = { section: string; schedules: ScheduleEntry[] };

const getScheduleList = async (code: string, prof: string): Promise<SectionEntry[]> => {
    const { currentYear, currentSem } = await getAppConfig();

    const { data, error } = await supabaseServer.rpc("get_schedule_list", {
        course_code: code,
        prof: prof.replaceAll("%20", " ").replaceAll("$", "/"),
        target_year: currentYear,
        target_sem: currentSem,
    });

    if (error) {
        console.error("[getScheduleList] rpc failed:", error.message);
        return [];
    }

    const sections = new Map<string, SectionEntry>();

    for (const entry of data ?? []) {
        const section = String(entry.section);
        const bucket = sections.get(section) ?? { section, schedules: [] };
        const schedule: ScheduleEntry = { date: entry.date, time: entry.times, location: entry.location };

        if (!bucket.schedules.some((item) =>
            item.date === schedule.date && item.time === schedule.time && item.location === schedule.location
        )) {
            bucket.schedules.push(schedule);
        }

        sections.set(section, bucket);
    }

    return Array.from(sections.values());
};

export default getScheduleList;

