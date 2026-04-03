import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const spotId = body?.spot_id;
    const sensorStatus = body?.status;

    if (!spotId || sensorStatus === undefined) {
      return new Response('Faltan parametros spot_id o status', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase.rpc('ingest_spot_state', {
      p_spot_id: String(spotId),
      p_sensor_status: Number(sensorStatus),
    });

    if (error) {
      return new Response(error.message ?? 'Error interno', { status: 500, headers: corsHeaders });
    }

    return new Response(data?.message ?? 'Datos procesados', { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(`Error interno: ${String(error)}`, { status: 500, headers: corsHeaders });
  }
});
