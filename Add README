# Meeting Intelligence MCP

AI scheduling assistant for agents · x402 native · MCP compatible · Cloudflare Workers

Live at: `https://meetingmcp.ahrouchabdeallah.workers.dev`

---

## What It Does

Meeting Intelligence gives AI agents the scheduling tools they need to handle real-world booking workflows — timezone conversion, public holiday checking, business hours validation, multi-timezone slot finding, and Google Calendar event creation.

Instead of an agent guessing or hallucinating timezone offsets and holiday dates, it calls structured tools and gets reliable structured data back.

---

## Tools

### `convert_time`
Convert any time between timezones. Use when scheduling across countries.

```json
{
  "time": "2026-06-01T14:00:00",
  "from": "America/New_York",
  "to": "Europe/London"
}
```

**Returns:** Local times in both zones, UTC reference, offset difference.

---

### `get_holidays`
Get all public holidays for any country and year. Use before confirming a meeting date.

```json
{
  "country": "GB",
  "year": 2026
}
```

**Returns:** Complete list of public holidays with dates and names. Covers 100+ countries.

---

### `check_business_hours`
Check if it is currently business hours in any timezone. Use before scheduling outreach or calls.

```json
{
  "timezone": "Asia/Tokyo",
  "work_start": "09:00",
  "work_end": "18:00"
}
```

**Returns:** Current local time, day of week, open/closed status.

---

### `find_meeting_slots`
Find optimal meeting windows that work across multiple participant timezones. Returns up to 10 available slots.

```json
{
  "participants": "Europe/London,America/New_York,Asia/Singapore",
  "duration_minutes": 60,
  "days": 5
}
```

**Returns:** Up to 10 time slots with local time shown for every participant.

---

### `create_calendar_link`
Generate Google Calendar and Outlook add-to-calendar links. Use at the end of every scheduling workflow.

```json
{
  "title": "Product Review",
  "start": "2026-06-01T14:00:00Z",
  "end": "2026-06-01T15:00:00Z",
  "description": "Quarterly product review with the team",
  "location": "https://zoom.us/j/123456"
}
```

**Returns:** Ready-to-share Google Calendar link, Outlook link, and ICS file content.

---

### `create_event`
Create a real event directly in Google Calendar. Requires the user's access token.

```json
{
  "access_token": "ya29.your_token_here",
  "title": "Strategy Session",
  "start": "2026-06-01T14:00:00Z",
  "end": "2026-06-01T15:00:00Z",
  "attendees": ["alice@company.com", "bob@company.com"],
  "description": "Q3 planning session",
  "timezone": "Europe/London"
}
```

**Returns:** Event ID, confirmation link, attendees. Token available from [Google OAuth Playground](https://developers.google.com/oauthplayground) — select `https://www.googleapis.com/auth/calendar` scope.

---

## Payment — x402 Protocol

This server uses the x402 micropayment protocol. **$0.01 USDC per call** on Base network. No account. No subscription. Agents pay automatically.

**How it works:**

1. Agent calls any tool → server returns `402 Payment Required` with wallet address
2. Agent sends 0.01 USDC on Base network → gets transaction hash
3. Agent retries with `X-Payment: <tx_hash>` header → gets data

```bash
# Example with curl
curl -X POST https://YOUR-URL.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "X-Payment: 0x_your_tx_hash_here" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_holidays","arguments":{"country":"GB","year":2026}}}'
```

---

## Connect via MCP

### Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "meeting-intelligence": {
      "command": "npx",
      "args": ["-y", "@smithery/cli", "run", "YOUR-SMITHERY-URL"]
    }
  }
}
```

### Smithery
Install directly: [smithery.ai/server/stockvibes07/meeting-mcp](https://smithery.ai)

### Any MCP Client
MCP endpoint: `https://YOUR-URL.workers.dev/mcp`

Discovery: `https://YOUR-URL.workers.dev/.well-known/mcp.json`

---

## Real Workflow Example

**Agent task:** *"Schedule a 1-hour call with someone in New York and someone in Tokyo next week. Make sure it avoids UK bank holidays."*

The agent calls:
1. `get_holidays` → checks for UK holidays next week
2. `find_meeting_slots` → finds windows across London/New York/Tokyo
3. `convert_time` → confirms the best slot in all three timezones
4. `check_business_hours` → verifies all three locations are in working hours
5. `create_calendar_link` → generates links for all participants
6. `create_event` → books it in Google Calendar

**Six tool calls. One complete workflow. $0.06 total cost.**

---

## Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | Free | Status check |
| `/.well-known/mcp.json` | GET | Free | MCP discovery |
| `/mcp` | POST | Free (protocol) / x402 (tools) | MCP JSON-RPC |
| `/convert-time` | GET | x402 | Timezone conversion |
| `/holidays` | GET | x402 | Public holidays |
| `/business-hours` | GET | x402 | Business hours check |
| `/find-slots` | GET | x402 | Meeting slot finder |
| `/calendar-link` | GET | x402 | Calendar link generator |
| `/create-event` | POST | x402 | Google Calendar event |

---

## Data Sources

- **Public holidays:** [Nager.Date](https://date.nager.at) — free, covers 100+ countries
- **Timezone data:** JavaScript `Intl` API — built-in, always accurate
- **Calendar events:** [Google Calendar API](https://developers.google.com/calendar) — requires user access token

---

## Compatible With

Claude · ChatGPT · Cursor · VS Code · Windsurf · Cline · Claude Code · Any MCP client

---

## Deploy Your Own

1. Clone this repo
2. Replace wallet address in `worker.js` line 13
3. Deploy to Cloudflare Workers:

```bash
npm install
npx wrangler deploy
```

No other configuration needed. All data sources are free with no API keys required.

---

*Built on Cloudflare Workers · x402 Protocol · MCP 2024-11-05 spec*
