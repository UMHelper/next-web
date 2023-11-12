export function countUniqueValues(jsonList:any, keysToCount:any) {
    let result:any = {};

    keysToCount.forEach((key:any) => {
        result[key] = [];
    });

    jsonList.forEach((obj:any) => {
        keysToCount.forEach((key:any) => {
            const value = obj[key];

            if (!result[key].includes(value)) {
                if (value !== null && value !== undefined && value !== '') {
                    result[key].push(value);
                }
                // result[key].push(value);
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
    'Offering_Department':'Department',
    'Offering_Unit':'Faculty',
    'Course_Duration': 'Duration',
    'Credits': 'Credits',
    'Is_Offered':'Offered',
    'Medium_of_Instruction':'Language',
    'courseType':'GE/Non-GE',
    'offeringProgLevel':'UG/PG',
    'suggestedYearOfStudy':'Learn at'
}