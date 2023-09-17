interface CourseInfo{
    courseCode:string,
    Offering_Unit:string,
    Old_code:string,
    Credits:number,
    Medium_of_Instruction:string,
    Offering_Department:string,
    courseTitle:string,
    suggestedYearOfStudy:string,
}
interface ScheduleInfo{
    date:string,
    time:string,
    location:string,
}
interface Schedule{
    section:string,
    schedules:ScheduleInfo[],
}

interface CourseOffering{
    is_offer:boolean,
    schedules:Schedule[],
}

interface ProfInfo{
    name:string,
    hard:number,
    grade:number,
    attendance:number,
    offer_info:CourseOffering,
    result:number,
    reward:number,
}