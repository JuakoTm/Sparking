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
    return new Response(JSON.stringify({ error: 'Metodo no permitido. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { action, id, name, order, desc, color } = body ?? {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (action === 'create') {
      if (!name || String(name).trim() === '') {
        return new Response(JSON.stringify({ error: 'El nombre de la zona es requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const zoneId = id || `zone_${Date.now()}`;
      const zoneOrder = order === undefined ? 999 : Number(order);

      const { error } = await supabase.from('parking_zones').insert({
        id: zoneId,
        name: String(name).trim(),
        sort_order: zoneOrder,
        description: desc || '',
        color: color || 'blue',
      });

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        message: 'Zona creada exitosamente',
        zone: { id: zoneId, name, order: zoneOrder, desc, color },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      if (!id) {
        return new Response(JSON.stringify({ error: 'El ID de la zona es requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!name || String(name).trim() === '') {
        return new Response(JSON.stringify({ error: 'El nombre de la zona es requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const updateData: Record<string, unknown> = {
        name: String(name).trim(),
      };

      if (order !== undefined) updateData.sort_order = Number(order);
      if (desc !== undefined) updateData.description = desc;
      if (color !== undefined) updateData.color = color;

      const { error } = await supabase.from('parking_zones').update(updateData).eq('id', String(id));

      if (error) throw error;

      return new Response(JSON.stringify({
        success: true,
        message: 'Zona actualizada exitosamente',
        zone: { id, ...updateData },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      if (!id) {
        return new Response(JSON.stringify({ error: 'El ID de la zona es requerido' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase.from('parking_zones').delete().eq('id', String(id));
      if (error) throw error;

      return new Response(JSON.stringify({ success: true, message: 'Zona eliminada exitosamente' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `Accion no valida: ${action}. Use 'create', 'update' o 'delete'` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: `Error interno: ${String(error)}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
