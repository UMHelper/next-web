import { getAppConfig } from "@/lib/config/app-config";
import supabaseServer from "@/lib/supabase/server";

type ScheduleEntry = { date: string; time: string; location: string };
export type SectionEntry = { section: string; schedules: ScheduleEntry[] };

export class ScheduleListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleListError";
  }
}

function normalizeProf(prof: string): string {
  return prof.replaceAll("%20", " ").replaceAll("$", "/");
}

function groupScheduleRows(data: unknown): SectionEntry[] {
  const sections = new Map<string, SectionEntry>();

  for (const entry of (data ?? []) as Array<{
    section: unknown;
    date: string;
    times: string;
    location: string;
  }>) {
    const section = String(entry.section);
    const bucket = sections.get(section) ?? { section, schedules: [] };
    const schedule: ScheduleEntry = { date: entry.date, time: entry.times, location: entry.location };

    if (
      !bucket.schedules.some(
        (item) =>
          item.date === schedule.date && item.time === schedule.time && item.location === schedule.location,
      )
    ) {
      bucket.schedules.push(schedule);
    }

    sections.set(section, bucket);
  }

  return Array.from(sections.values());
}

export async function fetchScheduleList(
  code: string,
  prof: string,
): Promise<{ year: number; sem: number; sections: SectionEntry[] }> {
  const { currentYear, currentSem } = await getAppConfig();

  const { data, error } = await supabaseServer.rpc("get_schedule_list", {
    course_code: code,
    prof: normalizeProf(prof),
    target_year: currentYear,
    target_sem: currentSem,
  });

  if (error) {
    throw new ScheduleListError(error.message);
  }

  return {
    year: currentYear,
    sem: currentSem,
    sections: groupScheduleRows(data),
  };
}

const getScheduleList = async (code: string, prof: string): Promise<SectionEntry[]> => {
  try {
    const { sections } = await fetchScheduleList(code, prof);
    return sections;
  } catch (error) {
    if (error instanceof ScheduleListError) {
      console.error("[getScheduleList] rpc failed:", error.message);
      return [];
    }
    throw error;
  }
};

export default getScheduleList;
