import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metodo no permitido. Use GET o POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let target = new Date();
    let developmentMode = false;

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (body?.hoursAgo !== undefined) {
        const hoursAgo = Number(body.hoursAgo);
        if (!Number.isNaN(hoursAgo) && hoursAgo >= 0) {
          target = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
          developmentMode = true;
        }
      }
    }

    const { data: cleanupDeleted, error: cleanupError } = await supabase.rpc('cleanup_expired_reservations');
    if (cleanupError) {
      return new Response(JSON.stringify({ error: cleanupError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabase.rpc('save_hourly_snapshot', { p_target: target.toISOString() });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ...(data || {}),
      development_mode: developmentMode,
      cleanup_expired_count: cleanupDeleted ?? 0,
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
