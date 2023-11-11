export function countUniqueValues(jsonList:any, keysToCount:any) {
    let result:any = {};

    keysToCount.forEach((key:any) => {
        result[key] = [];
    });

    jsonList.forEach((obj:any) => {
        keysToCount.forEach((key:any) => {
            const value = obj[key];

            if (!result[key].includes(value)) {
                result[key].push(value);
            }
        });
    });

    for (let i=0;i<result.Is_Offered.length;i++){
        if (result.Is_Offered[i]===1){
            result.Is_Offered[i]='Offered'
        }
        else{
            result.Is_Offered[i]='Not Offered'
        }
    }

    keysToCount.forEach((key:any) => {
        if (result[key].length > 1) {

            result[key].unshift('All');
        }
    });
    


    return result;
}

export const courseKeysToCount = [
    // 'Course_Duration',
    'Credits',
    'Is_Offered',
    // 'Medium_of_Instruction',
    'Offering_Department',
    'Offering_Unit', 
    'courseType', 
    'offeringProgLevel', 
    // 'suggestedYearOfStudy'
]

export const CourseFilterName:any = {
    'Course_Duration': 'Duration',
    'Credits': 'Credits',
    'Is_Offered':'Offer/Not Offer',
    'Medium_of_Instruction':'Language',
    'Offering_Department':'Dept',
    'Offering_Unit':'Fac',
    'courseType':'GE/Non-GE',
    'offeringProgLevel':'UG/PG',
    'suggestedYearOfStudy':'Learn at'
}