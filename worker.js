/**
 * Meeting Intelligence API
 * ─────────────────────────────────────────────────────────
 * Scheduling tools for AI agents · x402 native · MCP compatible
 * Price: $0.01 USDC per call on Base network
 *
 * Tools:
 *   convert_time        · Convert time between any timezones
 *   get_holidays        · Public holidays for any country/year
 *   check_business_hours · Is it working hours in a given timezone?
 *   find_meeting_slots  · Best meeting windows across multiple timezones
 *   create_calendar_link · Generate Google/Outlook add-to-calendar links
 *   create_event        · Create a real Google Calendar event
 */

const CONFIG = {
  PRICE:       "0.01",
  TOKEN:       "USDC",
  NETWORK:     "base",
  WALLET:      "0x4B745B47FcCb254d36fD8e3Bc52484a4405C3f12",
  NAME:        "Meeting Intelligence API",
  VERSION:     "1.0.0",
  DESCRIPTION: "AI scheduling assistant. Timezone intelligence, public holidays, business hours checking, meeting slot finder, and Google Calendar event creation. x402 native — no signup required. Pay $0.01 per call.",
  TAGS:        ["calendar", "scheduling", "meeting", "timezone", "productivity", "x402", "workflow"]
};

// ─── Main Handler ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const origin = `${url.protocol}//${url.host}`;
    const cors   = getCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      // ── Free endpoints ─────────────────────────────────────────────────────
      if (path === "/health")                      return handleHealth(cors);
      if (path === "/.well-known/mcp.json")        return handleDiscovery(origin, cors);
      if (path === "/.well-known/agent-card.json") return handleAgentCard(origin, cors);

      // ── MCP JSON-RPC ───────────────────────────────────────────────────────
      if (path === "/mcp" && request.method === "POST") {
        return handleMcp(request, cors);
      }

      // ── REST API (x402 required) ───────────────────────────────────────────
      const payErr = requirePayment(request, cors);
      if (payErr) return payErr;

      if (path === "/convert-time")        return handleConvertTime(url, cors);
      if (path === "/holidays")            return handleHolidays(url, cors);
      if (path === "/business-hours")      return handleBusinessHours(url, cors);
      if (path === "/find-slots")          return handleFindSlots(url, cors);
      if (path === "/calendar-link")       return handleCalendarLink(url, cors);
      if (path === "/create-event" && request.method === "POST") {
        return handleCreateEvent(request, cors);
      }

      return jsonRes({
        error: "Not found",
        endpoints: ["/convert-time", "/holidays", "/business-hours", "/find-slots", "/calendar-link", "/create-event", "/mcp", "/health"]
      }, cors, 404);

    } catch (err) {
      console.error(err);
      return jsonRes({ error: "Internal server error", message: err.message }, cors, 500);
    }
  }
};

// ─── x402 Payment ────────────────────────────────────────────────────────────

function requirePayment(request, cors) {
  const payment = request.headers.get("X-Payment") || request.headers.get("X-Payment-Tx");
  if (payment) return null;

  return new Response(JSON.stringify({
    error: "Payment required",
    message: `This endpoint costs ${CONFIG.PRICE} ${CONFIG.TOKEN} per call`,
    x402: {
      price:    CONFIG.PRICE,
      currency: CONFIG.TOKEN,
      network:  CONFIG.NETWORK,
      wallet:   CONFIG.WALLET,
      instructions: [
        "1. Send exactly 0.01 USDC on Base network to the wallet address above",
        "2. Copy your transaction hash",
        "3. Retry this request with header: X-Payment: <your_tx_hash>"
      ]
    }
  }, null, 2), {
    status: 402,
    headers: {
      ...cors,
      "Content-Type":     "application/json",
      "WWW-Authenticate": `X402 price="${CONFIG.PRICE}" currency="${CONFIG.TOKEN}" network="${CONFIG.NETWORK}" wallet="${CONFIG.WALLET}"`,
      "X-Payment-Price":  CONFIG.PRICE,
      "X-Payment-Wallet": CONFIG.WALLET,
      "X-Payment-Network":CONFIG.NETWORK
    }
  });
}

// ─── Tool: Convert Time ───────────────────────────────────────────────────────
// GET /convert-time?time=2026-05-20T14:00:00&from=America/New_York&to=Europe/London

async function handleConvertTime(url, cors) {
  const time = url.searchParams.get("time");
  const from = url.searchParams.get("from") || "UTC";
  const to   = url.searchParams.get("to")   || "UTC";

  if (!time) return jsonRes({ error: "time parameter required (ISO 8601 format)" }, cors, 400);

  try {
    const date = new Date(time);
    if (isNaN(date.getTime())) return jsonRes({ error: "Invalid time format. Use ISO 8601 e.g. 2026-05-20T14:00:00" }, cors, 400);

    const fromFormatted = formatInTimezone(date, from);
    const toFormatted   = formatInTimezone(date, to);
    const offsetDiff    = getOffsetDiff(date, from, to);

    return jsonRes({
      original:    { time: fromFormatted, timezone: from },
      converted:   { time: toFormatted,   timezone: to   },
      offset_diff: offsetDiff,
      utc:         date.toISOString(),
      timestamp:   new Date().toISOString()
    }, cors);

  } catch (err) {
    return jsonRes({ error: "Invalid timezone. Use IANA timezone names e.g. America/New_York, Europe/London, Asia/Tokyo" }, cors, 400);
  }
}

// ─── Tool: Public Holidays ────────────────────────────────────────────────────
// GET /holidays?country=GB&year=2026

async function handleHolidays(url, cors) {
  const country = (url.searchParams.get("country") || "GB").toUpperCase();
  const year    = url.searchParams.get("year") || new Date().getFullYear().toString();

  const res  = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
  if (!res.ok) return jsonRes({ error: `No holiday data for country code: ${country}` }, cors, 400);

  const holidays = await res.json();

  return jsonRes({
    country,
    year:      parseInt(year),
    holidays:  holidays.map(h => ({
      date:    h.date,
      name:    h.name,
      type:    h.types?.[0] || "Public",
      global:  h.global
    })),
    count:     holidays.length,
    source:    "Nager.Date (public domain data)",
    timestamp: new Date().toISOString()
  }, cors);
}

// ─── Tool: Business Hours Check ───────────────────────────────────────────────
// GET /business-hours?timezone=Europe/London&start=09:00&end=17:30

async function handleBusinessHours(url, cors) {
  const timezone  = url.searchParams.get("timezone") || "UTC";
  const startHour = url.searchParams.get("start")    || "09:00";
  const endHour   = url.searchParams.get("end")      || "17:30";

  try {
    const now       = new Date();
    const localTime = getLocalTime(now, timezone);
    const day       = getDayName(now, timezone);
    const isWeekend = ["Saturday", "Sunday"].includes(day);

    const [startH, startM] = startHour.split(":").map(Number);
    const [endH,   endM]   = endHour.split(":").map(Number);
    const [curH,   curM]   = localTime.split(":").map(Number);

    const nowMins   = curH   * 60 + curM;
    const startMins = startH * 60 + startM;
    const endMins   = endH   * 60 + endM;
    const isHours   = !isWeekend && nowMins >= startMins && nowMins < endMins;

    return jsonRes({
      timezone,
      current_local_time: localTime,
      current_day:        day,
      business_hours:     `${startHour}–${endHour}`,
      is_business_hours:  isHours,
      is_weekend:         isWeekend,
      status:             isHours ? "OPEN — within business hours" : isWeekend ? "CLOSED — weekend" : "CLOSED — outside business hours",
      timestamp:          new Date().toISOString()
    }, cors);
  } catch {
    return jsonRes({ error: "Invalid timezone. Use IANA timezone names e.g. Europe/London, America/New_York" }, cors, 400);
  }
}

// ─── Tool: Find Meeting Slots ─────────────────────────────────────────────────
// GET /find-slots?participants=Europe/London,America/New_York,Asia/Tokyo&duration=60&days=5

async function handleFindSlots(url, cors) {
  const participantsStr = url.searchParams.get("participants") || "Europe/London,America/New_York";
  const duration        = parseInt(url.searchParams.get("duration") || "60");
  const days            = parseInt(url.searchParams.get("days")     || "5");
  const workStart       = url.searchParams.get("work_start")        || "09:00";
  const workEnd         = url.searchParams.get("work_end")          || "17:00";

  const timezones = participantsStr.split(",").map(t => t.trim());
  const slots     = [];

  const [wsH, wsM] = workStart.split(":").map(Number);
  const [weH, weM] = workEnd.split(":").map(Number);

  // Check the next `days` working days
  const today = new Date();
  let checked = 0;
  let offset  = 1;

  while (checked < days && offset < 30) {
    const date    = new Date(today);
    date.setDate(today.getDate() + offset);
    offset++;

    const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    if (["Saturday", "Sunday"].includes(dayName)) continue;
    checked++;

    // Try every 30-minute slot in working hours
    const windowStart = wsH * 60 + wsM;
    const windowEnd   = weH * 60 + weM - duration;

    for (let m = windowStart; m <= windowEnd; m += 30) {
      const slotH     = Math.floor(m / 60);
      const slotMin   = m % 60;
      const slotUTC   = new Date(date);
      slotUTC.setUTCHours(0, 0, 0, 0);

      // Find UTC time that corresponds to slotH:slotMin in first timezone
      const tzOffset  = getTimezoneOffsetMinutes(slotUTC, timezones[0]);
      const utcMins   = m - tzOffset;
      slotUTC.setUTCMinutes(utcMins);

      // Check if this UTC time is in business hours for ALL participants
      const fits = timezones.every(tz => {
        const localMins = getLocalMinutes(slotUTC, tz);
        const localDay  = getDayName(slotUTC, tz);
        if (["Saturday", "Sunday"].includes(localDay)) return false;
        return localMins >= windowStart && localMins + duration <= weH * 60 + weM;
      });

      if (fits) {
        slots.push({
          utc:          slotUTC.toISOString(),
          duration_min: duration,
          local_times:  timezones.reduce((acc, tz) => {
            acc[tz] = formatInTimezone(slotUTC, tz);
            return acc;
          }, {})
        });
      }
    }
  }

  return jsonRes({
    participants:   timezones,
    duration_min:   duration,
    working_hours:  `${workStart}–${workEnd}`,
    days_checked:   checked,
    slots_found:    slots.length,
    slots:          slots.slice(0, 10), // Return top 10 slots
    timestamp:      new Date().toISOString()
  }, cors);
}

// ─── Tool: Create Calendar Link ───────────────────────────────────────────────
// GET /calendar-link?title=Team+Meeting&start=2026-05-20T14:00:00Z&end=2026-05-20T15:00:00Z&description=...&location=...

function handleCalendarLink(url, cors) {
  const title       = url.searchParams.get("title")       || "Meeting";
  const start       = url.searchParams.get("start");
  const end         = url.searchParams.get("end");
  const description = url.searchParams.get("description") || "";
  const location    = url.searchParams.get("location")    || "";

  if (!start || !end) return jsonRes({ error: "start and end parameters required (ISO 8601 UTC format)" }, cors, 400);

  try {
    const startDate = new Date(start);
    const endDate   = new Date(end);

    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    // Google Calendar link
    const googleParams = new URLSearchParams({
      action:  "TEMPLATE",
      text:    title,
      dates:   `${fmt(startDate)}/${fmt(endDate)}`,
      details: description,
      location
    });
    const googleLink = `https://calendar.google.com/calendar/render?${googleParams}`;

    // Outlook link
    const outlookParams = new URLSearchParams({
      subject:  title,
      startdt:  startDate.toISOString(),
      enddt:    endDate.toISOString(),
      body:     description,
      location
    });
    const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams}`;

    // ICS content (universal calendar format)
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Meeting Intelligence API//EN",
      "BEGIN:VEVENT",
      `DTSTART:${fmt(startDate)}`,
      `DTEND:${fmt(endDate)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${location}`,
      `UID:${Date.now()}@meeting-intelligence`,
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");

    return jsonRes({
      title,
      start: startDate.toISOString(),
      end:   endDate.toISOString(),
      links: {
        google:  googleLink,
        outlook: outlookLink,
        ics_content: icsContent
      },
      instructions: "Share the google or outlook link. Users click to add the event to their calendar.",
      timestamp: new Date().toISOString()
    }, cors);

  } catch {
    return jsonRes({ error: "Invalid date format. Use ISO 8601 e.g. 2026-05-20T14:00:00Z" }, cors, 400);
  }
}

// ─── Tool: Create Google Calendar Event ──────────────────────────────────────
// POST /create-event
// Body: { access_token, title, start, end, attendees, description, location, timezone }

async function handleCreateEvent(request, cors) {
  let body;
  try { body = await request.json(); }
  catch { return jsonRes({ error: "Invalid JSON body" }, cors, 400); }

  const { access_token, title, start, end, attendees, description, location, timezone } = body;

  if (!access_token) return jsonRes({ error: "access_token required. Get yours from Google OAuth Playground: https://developers.google.com/oauthplayground" }, cors, 400);
  if (!title || !start || !end) return jsonRes({ error: "title, start, and end are required" }, cors, 400);

  const event = {
    summary:     title,
    description: description || "",
    location:    location    || "",
    start:       { dateTime: new Date(start).toISOString(), timeZone: timezone || "UTC" },
    end:         { dateTime: new Date(end).toISOString(),   timeZone: timezone || "UTC" },
    attendees:   attendees ? attendees.map(email => ({ email })) : [],
    reminders:   { useDefault: true }
  };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${access_token}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify(event)
  });

  if (!res.ok) {
    const err = await res.json();
    return jsonRes({
      error:   "Google Calendar API error",
      detail:  err?.error?.message || "Check your access token",
      hint:    "Access tokens expire after 1 hour. Get a fresh one from https://developers.google.com/oauthplayground with scope: https://www.googleapis.com/auth/calendar"
    }, cors, res.status);
  }

  const created = await res.json();

  return jsonRes({
    success:    true,
    event_id:   created.id,
    title:      created.summary,
    start:      created.start?.dateTime,
    end:        created.end?.dateTime,
    link:       created.htmlLink,
    attendees:  created.attendees?.map(a => a.email) || [],
    status:     created.status,
    timestamp:  new Date().toISOString()
  }, cors);
}

// ─── MCP JSON-RPC 2.0 ─────────────────────────────────────────────────────────

async function handleMcp(request, cors) {
  let body;
  try { body = await request.json(); }
  catch { return mcpError(null, -32700, "Parse error", cors); }

  const { method, params, id } = body;

  if (method === "initialize") {
    return mcpOk(id, {
      protocolVersion: "2024-11-05",
      capabilities:    { tools: {} },
      serverInfo:      { name: CONFIG.NAME, version: CONFIG.VERSION }
    }, cors);
  }

  if (method === "notifications/initialized") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (method === "tools/list") {
    return mcpOk(id, { tools: getMcpTools() }, cors);
  }

  if (method === "tools/call") {
    const payment = request.headers.get("X-Payment") || request.headers.get("X-Payment-Tx");
    if (!payment) {
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id,
        error: {
          code: -32001, message: "Payment required",
          data: { price: CONFIG.PRICE, currency: CONFIG.TOKEN, network: CONFIG.NETWORK, wallet: CONFIG.WALLET }
        }
      }), {
        status: 402,
        headers: {
          ...cors, "Content-Type": "application/json",
          "WWW-Authenticate": `X402 price="${CONFIG.PRICE}" currency="${CONFIG.TOKEN}" network="${CONFIG.NETWORK}" wallet="${CONFIG.WALLET}"`
        }
      });
    }

    const name = params?.name;
    const args = params?.arguments || {};

    try {
      const result = await executeTool(name, args);
      return mcpOk(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }, cors);
    } catch (err) {
      return mcpError(id, -32000, err.message, cors);
    }
  }

  return mcpError(id, -32601, `Method not found: ${method}`, cors);
}

async function executeTool(name, args) {
  if (name === "convert_time") {
    const date = new Date(args.time);
    if (isNaN(date.getTime())) throw new Error("Invalid time format");
    return {
      original:  { time: formatInTimezone(date, args.from || "UTC"), timezone: args.from || "UTC" },
      converted: { time: formatInTimezone(date, args.to   || "UTC"), timezone: args.to   || "UTC" },
      offset_diff: getOffsetDiff(date, args.from || "UTC", args.to || "UTC"),
      utc: date.toISOString()
    };
  }

  if (name === "get_holidays") {
    const country = (args.country || "GB").toUpperCase();
    const year    = args.year     || new Date().getFullYear();
    const res     = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
    if (!res.ok) throw new Error(`No holiday data for: ${country}`);
    const holidays = await res.json();
    return { country, year, holidays: holidays.map(h => ({ date: h.date, name: h.name })), count: holidays.length };
  }

  if (name === "check_business_hours") {
    const tz      = args.timezone   || "UTC";
    const start   = args.work_start || "09:00";
    const end     = args.work_end   || "17:00";
    const now     = new Date();
    const day     = getDayName(now, tz);
    const time    = getLocalTime(now, tz);
    const isWeekend = ["Saturday", "Sunday"].includes(day);
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const [ch, cm] = time.split(":").map(Number);
    const nowM  = ch  * 60 + cm;
    const startM = sh * 60 + sm;
    const endM   = eh * 60 + em;
    const isOpen = !isWeekend && nowM >= startM && nowM < endM;
    return { timezone: tz, current_time: time, day, is_business_hours: isOpen, status: isOpen ? "OPEN" : "CLOSED" };
  }

  if (name === "find_meeting_slots") {
    const timezones = (args.participants || "Europe/London,America/New_York").split(",").map(t => t.trim());
    const duration  = args.duration_minutes || 60;
    const days      = args.days             || 5;
    const workStart = args.work_start       || "09:00";
    const workEnd   = args.work_end         || "17:00";

    const [wsH, wsM] = workStart.split(":").map(Number);
    const [weH, weM] = workEnd.split(":").map(Number);
    const slots = [];
    const today = new Date();
    let checked = 0, offset = 1;

    while (checked < days && offset < 30) {
      const date = new Date(today);
      date.setDate(today.getDate() + offset++);
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      if (["Saturday", "Sunday"].includes(dayName)) continue;
      checked++;

      for (let m = wsH * 60 + wsM; m <= weH * 60 + weM - duration; m += 30) {
        const slotUTC = new Date(date);
        slotUTC.setUTCHours(0, 0, 0, 0);
        const tzOffset = getTimezoneOffsetMinutes(slotUTC, timezones[0]);
        slotUTC.setUTCMinutes(m - tzOffset);

        const fits = timezones.every(tz => {
          const lm = getLocalMinutes(slotUTC, tz);
          const ld = getDayName(slotUTC, tz);
          if (["Saturday", "Sunday"].includes(ld)) return false;
          return lm >= wsH * 60 + wsM && lm + duration <= weH * 60 + weM;
        });

        if (fits) {
          slots.push({
            utc: slotUTC.toISOString(),
            duration_minutes: duration,
            local_times: timezones.reduce((a, tz) => ({ ...a, [tz]: formatInTimezone(slotUTC, tz) }), {})
          });
        }
      }
    }
    return { participants: timezones, duration_minutes: duration, slots_found: slots.length, slots: slots.slice(0, 10) };
  }

  if (name === "create_calendar_link") {
    const fmt = d => new Date(d).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const p = new URLSearchParams({
      action: "TEMPLATE", text: args.title || "Meeting",
      dates: `${fmt(args.start)}/${fmt(args.end)}`,
      details: args.description || "", location: args.location || ""
    });
    return {
      title: args.title,
      google_link: `https://calendar.google.com/calendar/render?${p}`,
      outlook_link: `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(args.title)}&startdt=${new Date(args.start).toISOString()}&enddt=${new Date(args.end).toISOString()}`
    };
  }

  if (name === "create_event") {
    if (!args.access_token) throw new Error("access_token required");
    const event = {
      summary: args.title, description: args.description || "", location: args.location || "",
      start: { dateTime: new Date(args.start).toISOString(), timeZone: args.timezone || "UTC" },
      end:   { dateTime: new Date(args.end).toISOString(),   timeZone: args.timezone || "UTC" },
      attendees: (args.attendees || []).map(e => ({ email: e }))
    };
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: { "Authorization": `Bearer ${args.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e?.error?.message || "Google Calendar error"); }
    const c = await res.json();
    return { event_id: c.id, title: c.summary, start: c.start?.dateTime, end: c.end?.dateTime, link: c.htmlLink };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ─── MCP Tool Definitions ─────────────────────────────────────────────────────

function getMcpTools() {
  return [
    {
      name: "convert_time",
      description: "Convert a time from one timezone to another. Use when scheduling across countries or checking what time an event is locally.",
      annotations: {
        readOnlyHint:    true,
        idempotentHint:  true,
        openWorldHint:   false,
        destructiveHint: false
      },
      inputSchema: {
        type: "object", required: ["time"],
        properties: {
          time: { type: "string", description: "Time to convert in ISO 8601 format e.g. 2026-05-20T14:00:00" },
          from: { type: "string", description: "Source timezone (IANA name) e.g. America/New_York. Default: UTC" },
          to:   { type: "string", description: "Target timezone (IANA name) e.g. Europe/London. Default: UTC" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          original:    { type: "object", properties: { time: { type: "string" }, timezone: { type: "string" } } },
          converted:   { type: "object", properties: { time: { type: "string" }, timezone: { type: "string" } } },
          offset_diff: { type: "string", description: "Timezone offset difference e.g. +5h or -3h 30m" },
          utc:         { type: "string", description: "UTC representation in ISO 8601 format" },
          timestamp:   { type: "string", description: "When this response was generated" }
        }
      }
    },
    {
      name: "get_holidays",
      description: "Get all public holidays for any country and year. Use before scheduling to avoid booking on national holidays.",
      annotations: {
        readOnlyHint:    true,
        idempotentHint:  true,
        openWorldHint:   true,
        destructiveHint: false
      },
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "ISO 3166-1 country code e.g. GB, US, DE, FR, JP. Default: GB" },
          year:    { type: "integer", description: "Year e.g. 2026. Default: current year" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          country:  { type: "string", description: "ISO country code" },
          year:     { type: "integer", description: "Year queried" },
          holidays: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", description: "Holiday date in YYYY-MM-DD format" },
                name: { type: "string", description: "Official holiday name" }
              }
            }
          },
          count:     { type: "integer", description: "Total number of public holidays" },
          source:    { type: "string" },
          timestamp: { type: "string" }
        }
      }
    },
    {
      name: "check_business_hours",
      description: "Check if it is currently business hours in a given timezone. Use before scheduling a call or sending an outreach.",
      annotations: {
        readOnlyHint:    true,
        idempotentHint:  false,
        openWorldHint:   false,
        destructiveHint: false
      },
      inputSchema: {
        type: "object",
        properties: {
          timezone:   { type: "string", description: "IANA timezone e.g. Europe/London, America/New_York, Asia/Tokyo" },
          work_start: { type: "string", description: "Business start time in HH:MM format. Default: 09:00" },
          work_end:   { type: "string", description: "Business end time in HH:MM format. Default: 17:00" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          timezone:           { type: "string", description: "The queried timezone" },
          current_local_time: { type: "string", description: "Current local time in HH:MM format" },
          current_day:        { type: "string", description: "Current day of the week e.g. Monday" },
          business_hours:     { type: "string", description: "Configured business hours range e.g. 09:00-17:00" },
          is_business_hours:  { type: "boolean", description: "True if currently within business hours" },
          is_weekend:         { type: "boolean", description: "True if today is Saturday or Sunday" },
          status:             { type: "string", description: "Human-readable status e.g. OPEN or CLOSED" },
          timestamp:          { type: "string" }
        }
      }
    },
    {
      name: "find_meeting_slots",
      description: "Find optimal meeting times that work across multiple participant timezones within business hours. Returns up to 10 available time slots.",
      annotations: {
        readOnlyHint:    true,
        idempotentHint:  false,
        openWorldHint:   false,
        destructiveHint: false
      },
      inputSchema: {
        type: "object",
        properties: {
          participants:     { type: "string",  description: "Comma-separated IANA timezone list e.g. Europe/London,America/New_York,Asia/Tokyo" },
          duration_minutes: { type: "integer", description: "Meeting duration in minutes. Default: 60" },
          days:             { type: "integer", description: "How many working days ahead to search. Default: 5" },
          work_start:       { type: "string",  description: "Working hours start HH:MM. Default: 09:00" },
          work_end:         { type: "string",  description: "Working hours end HH:MM. Default: 17:00" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          participants:  { type: "array", items: { type: "string" }, description: "List of timezones checked" },
          duration_min:  { type: "integer", description: "Meeting duration in minutes" },
          working_hours: { type: "string" },
          days_checked:  { type: "integer" },
          slots_found:   { type: "integer", description: "Total number of available slots found" },
          slots: {
            type: "array",
            items: {
              type: "object",
              properties: {
                utc:          { type: "string", description: "Slot start time in UTC ISO 8601" },
                duration_min: { type: "integer" },
                local_times:  { type: "object", description: "Start time shown in each participant timezone" }
              }
            }
          },
          timestamp: { type: "string" }
        }
      }
    },
    {
      name: "create_calendar_link",
      description: "Generate Google Calendar and Outlook add-to-calendar links. Use at the end of any scheduling workflow so participants can add the meeting.",
      annotations: {
        readOnlyHint:    true,
        idempotentHint:  true,
        openWorldHint:   false,
        destructiveHint: false
      },
      inputSchema: {
        type: "object", required: ["title", "start", "end"],
        properties: {
          title:       { type: "string", description: "Meeting title" },
          start:       { type: "string", description: "Start time in ISO 8601 UTC format e.g. 2026-05-20T14:00:00Z" },
          end:         { type: "string", description: "End time in ISO 8601 UTC format e.g. 2026-05-20T15:00:00Z" },
          description: { type: "string", description: "Meeting description or agenda" },
          location:    { type: "string", description: "Meeting location or video call link" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string" },
          end:   { type: "string" },
          links: {
            type: "object",
            properties: {
              google:      { type: "string", description: "Google Calendar add-to-calendar URL" },
              outlook:     { type: "string", description: "Outlook add-to-calendar URL" },
              ics_content: { type: "string", description: "ICS file content for universal calendar import" }
            }
          },
          instructions: { type: "string" },
          timestamp:     { type: "string" }
        }
      }
    },
    {
      name: "create_event",
      description: "Create a real event in Google Calendar. Requires the user's Google Calendar access token.",
      annotations: {
        readOnlyHint:    false,
        idempotentHint:  false,
        openWorldHint:   true,
        destructiveHint: false
      },
      inputSchema: {
        type: "object", required: ["access_token", "title", "start", "end"],
        properties: {
          access_token: { type: "string",  description: "Google Calendar OAuth2 access token. Get from https://developers.google.com/oauthplayground" },
          title:        { type: "string",  description: "Event title/summary" },
          start:        { type: "string",  description: "Start time ISO 8601 e.g. 2026-05-20T14:00:00Z" },
          end:          { type: "string",  description: "End time ISO 8601 e.g. 2026-05-20T15:00:00Z" },
          attendees:    { type: "array",   items: { type: "string" }, description: "Array of attendee email addresses" },
          description:  { type: "string",  description: "Event description or agenda" },
          location:     { type: "string",  description: "Physical location or video link" },
          timezone:     { type: "string",  description: "IANA timezone for the event. Default: UTC" }
        }
      },
      outputSchema: {
        type: "object",
        properties: {
          success:   { type: "boolean" },
          event_id:  { type: "string",  description: "Google Calendar event ID" },
          title:     { type: "string",  description: "Created event title" },
          start:     { type: "string",  description: "Event start time in ISO 8601" },
          end:       { type: "string",  description: "Event end time in ISO 8601" },
          link:      { type: "string",  description: "Google Calendar URL to view the event" },
          attendees: { type: "array",   items: { type: "string" }, description: "Invited attendee emails" },
          status:    { type: "string",  description: "Event status e.g. confirmed" },
          timestamp: { type: "string" }
        }
      }
    }
  ];
}

// ─── Discovery Endpoints ──────────────────────────────────────────────────────

function handleHealth(cors) {
  return jsonRes({ status: "ok", name: CONFIG.NAME, version: CONFIG.VERSION, price: `${CONFIG.PRICE} ${CONFIG.TOKEN} per call`, tools: 6 }, cors);
}

function handleDiscovery(origin, cors) {
  return jsonRes({
    schema: "mcp-registry/1.0",
    name: CONFIG.NAME, version: CONFIG.VERSION, description: CONFIG.DESCRIPTION,
    endpoint: `${origin}/mcp`, transport: "http",
    tools: ["convert_time", "get_holidays", "check_business_hours", "find_meeting_slots", "create_calendar_link", "create_event"],
    tags: CONFIG.TAGS,
    pricing: { model: "x402", price: CONFIG.PRICE, currency: CONFIG.TOKEN, network: CONFIG.NETWORK, wallet: CONFIG.WALLET }
  }, cors);
}

function handleAgentCard(origin, cors) {
  return jsonRes({
    name: CONFIG.NAME, version: CONFIG.VERSION, description: CONFIG.DESCRIPTION, url: origin,
    capabilities: ["timezone-conversion", "public-holidays", "business-hours", "meeting-scheduling", "calendar-events"],
    payment: { protocol: "x402", network: CONFIG.NETWORK, currency: CONFIG.TOKEN, price: CONFIG.PRICE }
  }, cors);
}

// ─── Timezone Helpers ─────────────────────────────────────────────────────────

function formatInTimezone(date, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(date);
}

function getLocalTime(date, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function getDayName(date, timezone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" }).format(date);
}

function getTimezoneOffsetMinutes(date, timezone) {
  const utcDate   = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return (localDate - utcDate) / 60000;
}

function getLocalMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false
  }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === "hour")?.value   || "0");
  const m = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  return h * 60 + m;
}

function getOffsetDiff(date, fromTz, toTz) {
  const fromOffset = getTimezoneOffsetMinutes(date, fromTz);
  const toOffset   = getTimezoneOffsetMinutes(date, toTz);
  const diff       = toOffset - fromOffset;
  const sign       = diff >= 0 ? "+" : "-";
  const hours      = Math.floor(Math.abs(diff) / 60);
  const mins       = Math.abs(diff) % 60;
  return `${sign}${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment, X-Payment-Tx, Authorization"
  };
}

function jsonRes(data, cors = {}, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });
}

function mcpOk(id, result, cors = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" }
  });
}

function mcpError(id, code, message, cors = {}) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" }
  });
}
