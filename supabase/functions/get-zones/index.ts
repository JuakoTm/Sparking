import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Metodo no permitido. Use GET.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('parking_zones')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      throw error;
    }

    const zones = (data ?? []).map((z) => ({
      id: z.id,
      name: z.name,
      order: z.sort_order,
      desc: z.description,
      color: z.color,
      created_at: z.created_at,
      updated_at: z.updated_at,
    }));

    if (zones.length === 0) {
      zones.push({
        id: 'General',
        name: 'General',
        order: 1,
        desc: 'Zona general por defecto',
        color: 'blue',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify(zones), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: `Error interno: ${String(error)}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
