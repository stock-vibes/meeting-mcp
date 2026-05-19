/**
 * Meeting Intelligence MCP — stdio server
 * For Glama Docker quality checks.
 * Real traffic uses the HTTP server at meeting-mcp.com
 */
import * as readline from 'readline';

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const res = await handle(req);
    if (res !== null) process.stdout.write(JSON.stringify(res) + '\n');
  } catch {}
});

async function handle({ method, params, id }) {
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'Meeting Intelligence API', version: '1.0.0' }
    }};
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: [
      {
        name: 'convert_time',
        description: 'Convert a time from one timezone to another.',
        inputSchema: { type: 'object', required: ['time'], properties: {
          time: { type: 'string', description: 'ISO 8601 time e.g. 2026-06-01T14:00:00' },
          from: { type: 'string', description: 'Source IANA timezone e.g. America/New_York' },
          to:   { type: 'string', description: 'Target IANA timezone e.g. Europe/London' }
        }}
      },
      {
        name: 'get_holidays',
        description: 'Get public holidays for any country and year.',
        inputSchema: { type: 'object', properties: {
          country: { type: 'string', description: 'ISO country code e.g. GB, US, DE' },
          year:    { type: 'integer', description: 'Year e.g. 2026' }
        }}
      },
      {
        name: 'check_business_hours',
        description: 'Check if it is currently business hours in a timezone.',
        inputSchema: { type: 'object', properties: {
          timezone:   { type: 'string', description: 'IANA timezone e.g. Europe/London' },
          work_start: { type: 'string', description: 'Start time HH:MM. Default 09:00' },
          work_end:   { type: 'string', description: 'End time HH:MM. Default 17:00' }
        }}
      },
      {
        name: 'find_meeting_slots',
        description: 'Find optimal meeting times across multiple timezones.',
        inputSchema: { type: 'object', properties: {
          participants:     { type: 'string',  description: 'Comma-separated IANA timezones' },
          duration_minutes: { type: 'integer', description: 'Duration in minutes. Default 60' },
          days:             { type: 'integer', description: 'Days to search ahead. Default 5' }
        }}
      },
      {
        name: 'create_calendar_link',
        description: 'Generate Google Calendar and Outlook add-to-calendar links.',
        inputSchema: { type: 'object', required: ['title','start','end'], properties: {
          title:       { type: 'string', description: 'Meeting title' },
          start:       { type: 'string', description: 'Start ISO 8601 UTC e.g. 2026-06-01T14:00:00Z' },
          end:         { type: 'string', description: 'End ISO 8601 UTC e.g. 2026-06-01T15:00:00Z' },
          description: { type: 'string', description: 'Meeting description' },
          location:    { type: 'string', description: 'Location or video link' }
        }}
      },
      {
        name: 'create_event',
        description: 'Create a real Google Calendar event.',
        inputSchema: { type: 'object', required: ['access_token','title','start','end'], properties: {
          access_token: { type: 'string',  description: 'Google OAuth2 access token' },
          title:        { type: 'string',  description: 'Event title' },
          start:        { type: 'string',  description: 'Start ISO 8601' },
          end:          { type: 'string',  description: 'End ISO 8601' },
          attendees:    { type: 'array',   items: { type: 'string' }, description: 'Attendee emails' },
          description:  { type: 'string',  description: 'Event description' },
          timezone:     { type: 'string',  description: 'IANA timezone. Default UTC' }
        }}
      }
    ]}};
  }

  if (method === 'tools/call') {
    try {
      const result = await executeTool(params?.name, params?.arguments || {});
      return { jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      }};
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message }};
    }
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` }};
}

async function executeTool(name, args) {
  if (name === 'convert_time') {
    const date = new Date(args.time);
    if (isNaN(date.getTime())) throw new Error('Invalid time format');
    const from = args.from || 'UTC';
    const to   = args.to   || 'UTC';
    return {
      original:  { time: fmt(date, from), timezone: from },
      converted: { time: fmt(date, to),   timezone: to },
      utc: date.toISOString()
    };
  }

  if (name === 'get_holidays') {
    const country = (args.country || 'GB').toUpperCase();
    const year    = args.year || new Date().getFullYear();
    const res     = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
    if (!res.ok) throw new Error(`No data for: ${country}`);
    const data = await res.json();
    return { country, year, holidays: data.map(h => ({ date: h.date, name: h.name })), count: data.length };
  }

  if (name === 'check_business_hours') {
    const tz      = args.timezone   || 'UTC';
    const start   = args.work_start || '09:00';
    const end     = args.work_end   || '17:00';
    const now     = new Date();
    const day     = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now);
    const time    = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    const isWeekend = ['Saturday','Sunday'].includes(day);
    const [sh,sm] = start.split(':').map(Number);
    const [eh,em] = end.split(':').map(Number);
    const [ch,cm] = time.split(':').map(Number);
    const nowM = ch*60+cm, startM = sh*60+sm, endM = eh*60+em;
    const isOpen = !isWeekend && nowM >= startM && nowM < endM;
    return { timezone: tz, current_time: time, day, is_business_hours: isOpen, status: isOpen ? 'OPEN' : 'CLOSED' };
  }

  if (name === 'find_meeting_slots') {
    const timezones = (args.participants || 'Europe/London,America/New_York').split(',').map(t => t.trim());
    const duration  = args.duration_minutes || 60;
    const days      = args.days || 5;
    const slots = [];
    const today = new Date();
    let checked = 0, offset = 1;
    while (checked < days && offset < 30) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset++);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
      if (['Saturday','Sunday'].includes(dayName)) continue;
      checked++;
      for (let m = 9*60; m <= 17*60 - duration; m += 30) {
        const slotUTC = new Date(date);
        slotUTC.setUTCHours(0, 0, 0, 0);
        const tzOffset = getOffset(slotUTC, timezones[0]);
        slotUTC.setUTCMinutes(m - tzOffset);
        const fits = timezones.every(tz => {
          const lm = getLocalMins(slotUTC, tz);
          const ld = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(slotUTC);
          if (['Saturday','Sunday'].includes(ld)) return false;
          return lm >= 9*60 && lm + duration <= 17*60;
        });
        if (fits) slots.push({
          utc: slotUTC.toISOString(),
          duration_minutes: duration,
          local_times: timezones.reduce((a, tz) => ({ ...a, [tz]: fmt(slotUTC, tz) }), {})
        });
      }
    }
    return { participants: timezones, slots_found: slots.length, slots: slots.slice(0, 10) };
  }

  if (name === 'create_calendar_link') {
    const fmtDate = d => new Date(d).toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
    const p = new URLSearchParams({
      action: 'TEMPLATE', text: args.title || 'Meeting',
      dates: `${fmtDate(args.start)}/${fmtDate(args.end)}`,
      details: args.description || '', location: args.location || ''
    });
    return {
      title: args.title,
      google_link: `https://calendar.google.com/calendar/render?${p}`,
      outlook_link: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(args.title)}&startdt=${new Date(args.start).toISOString()}&enddt=${new Date(args.end).toISOString()}`
    };
  }

  if (name === 'create_event') {
    if (!args.access_token) throw new Error('access_token required');
    const event = {
      summary: args.title, description: args.description || '', location: args.location || '',
      start: { dateTime: new Date(args.start).toISOString(), timeZone: args.timezone || 'UTC' },
      end:   { dateTime: new Date(args.end).toISOString(),   timeZone: args.timezone || 'UTC' },
      attendees: (args.attendees || []).map(e => ({ email: e }))
    };
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${args.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e?.error?.message || 'Calendar error'); }
    const c = await res.json();
    return { event_id: c.id, title: c.summary, start: c.start?.dateTime, link: c.htmlLink };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function fmt(date, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function getOffset(date, tz) {
  const utc   = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const local = new Date(date.toLocaleString('en-US', { timeZone: tz }));
  return (local - utc) / 60000;
}

function getLocalMins(date, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value   || '0');
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  return h * 60 + m;
}
