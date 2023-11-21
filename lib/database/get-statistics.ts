import supabase from '@/lib/database/database';

export const getStatistics = async () => {

    const { data, error } = await supabase.from('statistics')
                            .select('*')
        
    return data;
}