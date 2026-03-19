import { getSupabase } from './utils/supabase.js';

export default async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST requis' }), {
        status: 405, headers: { 'Content-Type': 'application/json' },
      });
    }

    const { user_id, type, sender_email, answer, context_addition } = await req.json();

    if (!user_id || !type || !answer) {
      return new Response(JSON.stringify({ error: 'user_id, type et answer requis' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = getSupabase();
    const { data: config, error: configError } = await supabase
      .from('user_configs')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (configError || !config) {
      return new Response(JSON.stringify({ error: 'Config non trouvée' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    const updates = {};

    if (type === 'sender_priority' && sender_email) {
      const priorities = config.sender_priorities || {};
      if (answer === 'downgrade') {
        // Déclasser : si critical → high, si high → supprimer
        const current = priorities[sender_email];
        if (current && current.level === 'critical') {
          priorities[sender_email] = { ...current, level: 'high' };
        } else {
          delete priorities[sender_email];
        }
      } else if (answer === 'upgrade') {
        // Remonter : si absent → high, si high → critical
        const current = priorities[sender_email];
        if (current && current.level === 'high') {
          priorities[sender_email] = { ...current, level: 'critical' };
        } else {
          priorities[sender_email] = { level: 'high', label: sender_email.split('@')[0] };
        }
      }
      // 'keep' → rien à changer, le classement est bon
      updates.sender_priorities = priorities;
    }

    if (type === 'context' && context_addition) {
      updates.context = (config.context || '') + '\n\n' + context_addition;
    }

    if (type === 'keyword' && context_addition) {
      const flags = config.keyword_flags || [];
      flags.push({ keywords: [context_addition], level: 'high' });
      updates.keyword_flags = flags;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await supabase.from('user_configs').update(updates).eq('user_id', user_id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('daily-answer error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
