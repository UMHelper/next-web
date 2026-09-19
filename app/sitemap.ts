import { MetadataRoute } from 'next'
import supabaseServer from '@/lib/supabase/server';
import { countUniqueValues, courseKeysToCount } from '@/lib/count-unique-values';
import { faculty, GE_COURSE_SLUG } from '@/lib/consant';

export const revalidate = 86400;

const fetchCourseSitemap = async () => {
    const { data, error }:{data:any,error:any} = await supabaseServer.from('course_noporf').select('New_code')
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
    const { data, error }:{data:any,error:any} = await supabaseServer.from('prof_with_course').select('course_id,prof_id')
    let reviewSitemap:any[]=[]
    data.map((review:any)=>{
        // return
        const prof=review.prof_id.replaceAll(' ','%20')
        reviewSitemap.push({
            url: `https://umeh.top/reviews/${review.course_id}/${prof}/`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        })
    })
    return [...reviewSitemap]
}

const fetchCatalogSitemap = async () => {
    let catalogSitemap:any[]=[]
    for (const fac of faculty) {
        catalogSitemap.push({
            url: `https://umeh.top/catalog/${fac}`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.7,
        })
        const baseQuery = supabaseServer.from('course_noporf').select('')
        const { data, error }: { data: any, error: any } = fac === GE_COURSE_SLUG
            ? await baseQuery.like('New_code', 'GE%')
            : await baseQuery.eq('Offering_Unit', fac)
        const option=countUniqueValues(data ?? [], courseKeysToCount)
        const depts=option.Offering_Department
        depts.map((dept:any)=>{
            catalogSitemap.push({
                url: `https://umeh.top/catalog/${fac}/${dept}`,
                lastModified: new Date(),
                changeFrequency: 'monthly',
                priority: 0.7,
            })
        })
    }
    return [...catalogSitemap]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const indexSitemap:any=[
        {
            url: 'https://umeh.top',
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 1,
        },
        {
            url: 'https://umeh.top/privacy-policy',
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: 'https://umeh.top/privacy-policy/zh',
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: 'https://umeh.top/terms-of-service',
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: 'https://umeh.top/terms-of-service/zh',
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ]
    const courseSitemap=await fetchCourseSitemap()

    const reviewSitemap=await fetchReviewSitemap()

    const catalogSitemap=await fetchCatalogSitemap()
    return [...indexSitemap,...courseSitemap,...catalogSitemap,...reviewSitemap,]
}
