import { MetadataRoute } from 'next'
import supabase from '@/lib/database/database';
import { countUniqueValues, courseKeysToCount } from '@/lib/count-unique-values';
import { faculty } from '@/lib/consant';
const fetchCourseSitemap = async () => {
    const { data, error }:{data:any,error:any} = await supabase.from('course_noporf').select('New_code')
    let courseSitemap:any[]=[]
    data.map((course:any)=>{
        courseSitemap.push({
            url: `https://umeh.top/course/${course.New_code}`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.9,
        })
    })
    return [...courseSitemap]
}

const fetchReviewSitemap = async () => {
    const { data, error }:{data:any,error:any} = await supabase.from('prof_with_course').select('course_id,prof_id')
    let reviewSitemap:any[]=[]
    data.map((review:any)=>{
        reviewSitemap.push({
            url: `https://umeh.top/reviews/${review.course_id}/${review.prof_id.replaceAll(" ", '%20')}`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        })
    })
    return [...reviewSitemap]
}

const fetchCatalogSitemap = async () => {
    let catalogSitemap:any[]=[]
    faculty.map(async (fac:any)=>{
        catalogSitemap.push({
            url: `https://umeh.top/catalog/${fac}`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        })
        const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
            .select('')
            .eq('Offering_Unit', fac.toUpperCase())
        const option=countUniqueValues(data, courseKeysToCount)
        const depts=option.Offering_Department
        depts.map((dept:any)=>{
            catalogSitemap.push({
                url: `https://umeh.top/catalog/${fac}/${dept}`,
                lastModified: new Date(),
                changeFrequency: 'monthly',
                priority: 0.7,
            })
        })
    })
    return [...catalogSitemap]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const indexSitemap=[
        {
            url: 'https://umeh.top',
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 1,
        },
    ]
    const courseSitemap=await fetchCourseSitemap()

    const reviewSitemap=await fetchReviewSitemap()

    const catalogSitemap=await fetchCatalogSitemap()

    return [...indexSitemap,...courseSitemap,...reviewSitemap,...catalogSitemap]
}