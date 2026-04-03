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
    const url = new URL(req.url);
    const daysParam = Number(url.searchParams.get('days') || '1');
    const zoneId = url.searchParams.get('zoneId');
    const days = Number.isNaN(daysParam) ? 1 : Math.min(Math.max(daysParam, 1), 30);

    const now = Date.now();
    const startTs = now - days * 24 * 60 * 60 * 1000;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('occupancy_history')
      .select('hour_key, ts, global, zones')
      .gte('ts', startTs)
      .order('ts', { ascending: true });

    if (error) {
      throw error;
    }

    const samples = (data ?? []).map((row) => {
      const entry: Record<string, unknown> = {
        hour_key: row.hour_key,
        ts: row.ts,
        global: row.global,
      };

      const zones = (row.zones || {}) as Record<string, any>;

      if (zoneId) {
        entry.zone = zones[zoneId] ?? null;
      } else {
        entry.zones_summary = Object.keys(zones).map((id) => ({
          id,
          occupancyPct: zones[id]?.occupancyPct,
          free: zones[id]?.free,
          occupied: zones[id]?.occupied,
          reserved: zones[id]?.reserved,
          total: zones[id]?.total,
        }));
      }

      return entry;
    });

    return new Response(JSON.stringify({
      success: true,
      days,
      zoneId,
      count: samples.length,
      from: new Date(startTs).toISOString(),
      to: new Date(now).toISOString(),
      samples,
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
