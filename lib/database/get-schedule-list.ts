import supabase from '@/lib/database/database';

const getScheduleList = async (code: string, prof: string) => {
    const { data, error }: { data: any, error: any } = await supabase.rpc('get_schedule_list', { course_code: code, prof: prof.replaceAll("%20", " ").replaceAll('$', '/') })
    let res: any[] = []
    data.forEach((entry: any) => {
        if ((entry.year.toString() === (process.env.NEXT_PUBLIC_CURRENT_YEAR ?? "2026")) && (entry.sem.toString() === (process.env.NEXT_PUBLIC_CURRENT_SEM ?? "1"))) {
            // Check if there is an existing section with the same section number
            let sectionEntry = res.find(item => item.section === entry.section);
            if (!sectionEntry) {
                // If section does not exist, create a new section entry
                sectionEntry = {
                    section: entry.section,
                    schedules: []
                };
                res.push(sectionEntry);
            }
            // Add the schedule to the section entry
            sectionEntry.schedules.push({
                date: entry.date,
                time: entry.times,
                location: entry.location
            });
            // remove duplicate schedules
            sectionEntry.schedules = sectionEntry.schedules.filter((schedule: any, index: number, self: any) =>
                index === self.findIndex((t: any) => (
                    t.date === schedule.date && t.time === schedule.time && t.location === schedule.location
                ))
            )
        }
    });
    return res;
}

export default getScheduleList;