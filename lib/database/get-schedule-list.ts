import supabase from '@/lib/database/database';

const getScheduleList = async (code: string, prof: string) => {
    const { data, error }: { data: any, error: any } = await supabase.rpc('get_schedule_list', { course_code: code, prof: prof.replaceAll("%20", " ").replaceAll('$', '/') })
    let res: any[] = []
    data.forEach((entry: any) => {
        if (entry.year.toString() === process.env.CURRENT_YEAR && entry.sem.toString() === process.env.CURRENT_SEM) {
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
        }
    });
    return res;
}

export default getScheduleList;