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
    return new Response(JSON.stringify({ error: 'Metodo no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { id, lat, lng, desc, zone_id, status } = body ?? {};

    if (!id || String(id).trim() === '') {
      return new Response(JSON.stringify({ error: 'Falta el ID del puesto' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const latNum = Number(lat);
    const lngNum = Number(lng);

    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      return new Response(JSON.stringify({ error: 'Coordenadas invalidas (lat/lng deben ser numeros)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const spotId = String(id).trim().toUpperCase();
    const spotStatus = status === undefined ? 1 : Number(status);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload = {
      id: spotId,
      lat: latNum,
      lng: lngNum,
      description: desc || `Puesto ${spotId}`,
      zone_id: zone_id || null,
      status: spotStatus,
      last_changed: new Date().toISOString(),
    };

    const { error } = await supabase.from('parking_spots').upsert(payload, { onConflict: 'id' });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Puesto creado/actualizado',
      spot: {
        id: spotId,
        lat: latNum,
        lng: lngNum,
        desc: desc || `Puesto ${spotId}`,
        status: spotStatus,
        zone_id: zone_id || null,
      },
    }), {
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
