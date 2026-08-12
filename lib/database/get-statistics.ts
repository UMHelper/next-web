import supabaseServer from '@/lib/supabase/server';

export const getStatistics = async () => {

    const { data, error } = await supabaseServer.from('statistics')
                            .select('*')
        
    return data;
}
