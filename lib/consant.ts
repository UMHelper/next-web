export interface MenuItem {
  name: string
  href: string
}

export const menuList:MenuItem[]=[
    // {
    //     name:'Home',
    //     href:"/"
    // },
    {
        name:'Catalog',
        href:"/catalog"
    },
    {
        name:'GE Course',
        href:"/catalog/gecourse"
    },
    {
        name:'Timetable',
        href:"/timetable"
    }
    // {
    //     name:'Blog',
    //     href:"/blog"
    // }
]

export const GE_COURSE_SLUG = 'gecourse'

export function getFacultyLabel(slug: string) {
    return slug.toLowerCase() === GE_COURSE_SLUG ? 'GE Course' : slug.toUpperCase()
}

export function normalizeFacultySlug(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, '')
    if (normalized === GE_COURSE_SLUG) return GE_COURSE_SLUG
    return value.toUpperCase()
}

export const faculty=[
    'FBA',           'FAH',
    'ICI',           'FST',
    'IAPME',         
    'ICMS',          'FSS', 
    'FED',           'FLL',
    'FHS',           'IME',
    'HC',            'RC',
    GE_COURSE_SLUG
]


export const faculty_dept:any = {
    'FAH': ['CJS', 'DCH', 'DENG', 'DHIST', 'DPHIL', 'DPT', 'ELC'] ,
    'FBA': ['AIM', 'DRTM', 'FBE', 'IIRM', 'MMI'] ,
    'FLL': ['MLS'] ,
    'FSS': ['DCOM', 'DECO', 'DGPA', 'DPSY', 'DSOC'] ,
    'FST': ['CEE', 'CIS', 'CSG', 'DPC', 'ECE', 'EME', 'MAT'] ,
    'ICI': ['CIE'],
    'FED': [], 
    'FHS': [], 
    'HC': [], 
    'IAPME': [], 
    'ICMS': [], 
    'RC' : [],
    'IME': [],
    [GE_COURSE_SLUG]:['GEGA','GESB','GEST','GELH']
};

export const NO_ROOT_LAYOUT_LIST=[
    'sign-in',
    'sign-up',
]

export const REACTION_EMOJI_LIST=['👍','👎','🤣','💩','❤️️']
export const AVATAR_EMOJI_LIST=['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐦‍⬛','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐢','🐍','🐙','🦐','🦞','🦀','🐟','🐬','🐳','🐊','🦣','🦒','🦘','🐄','🐎','🦜','🦢','🐇','🐿','🦔','🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑']