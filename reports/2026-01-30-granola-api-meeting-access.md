---
title: "Granola Meeting Data Access: Local Cache + Unofficial API"
date: 2026-01-30
topic: granola-api
recommendation: Local cache file (cache-v3.json) with optional unofficial API
version_researched: Granola desktop app (Jan 2026)
use_when:
  - You need programmatic access to your own Granola meeting notes
  - Building automation/integration with Claude, Obsidian, or other tools
  - Want to export meetings in bulk to other systems
  - Need to search/analyze meeting content locally
avoid_when:
  - You need official, supported API access (doesn't exist)
  - Building a commercial product that depends on stable API
  - Need real-time webhooks for new meetings (use Zapier instead)
  - Accessing other users' meeting data (not possible)
project_context:
  language: TypeScript/Python
  relevant_dependencies: []
---

## Summary

**Granola does not have a public API.** The company has stated they currently don't have plans to support a public API, focusing first on Zapier as their integration solution[1]. However, the Granola desktop app stores all meeting data locally, and developers have reverse-engineered both the local cache format and the private API endpoints.

**Two access methods exist:**

1. **Local cache file** (`~/Library/Application Support/Granola/cache-v3.json`) — Contains all meetings, transcripts, and metadata. Works offline, no authentication needed, no rate limits. This is the recommended approach for personal automation[2].

2. **Unofficial private API** (`api.granola.ai`) — REST endpoints using WorkOS authentication tokens extracted from local files. Provides fresher data but tokens expire frequently and this is unsupported[3].

**Community tools available:**
- [granola-ai-mcp-server](https://github.com/nehiljain/granola-ai-mcp-server) — MCP server for Claude Desktop integration
- [granola-export-tool](https://github.com/haasonsaas/granola-export-tool) — CLI for exporting to JSON/Markdown/CSV
- [Raycast Extension](https://www.raycast.com/Rob/granola) — Search and export via Raycast
- [GranolaObsidian](https://github.com/coopersmith/GranolaObsidian) — Sync to Obsidian vault

For official integrations, Granola offers Zapier (8,000+ apps), Slack, Notion, and CRM connectors (HubSpot, Attio, Affinity)[4].

## Philosophy & Mental Model

Granola's architecture is **local-first**. Unlike Otter.ai or Fireflies which use cloud bots, Granola records audio locally on your device and syncs selectively to the cloud. This design philosophy means:

1. **Your data lives on your machine** — The `cache-v3.json` file contains your complete meeting history
2. **No bot joins calls** — Audio captured via system audio, not a meeting participant
3. **Cloud is for sync/backup** — The API exists primarily for cross-device sync, not external access
4. **Authentication via WorkOS** — Enterprise SSO system with rotating refresh tokens

**Mental model:** Think of Granola like a local database with cloud backup. For integrations, read from the local cache (fastest, most reliable) or use Zapier for event-driven workflows when official support matters.

## Setup

### Method 1: Local Cache Access (Recommended)

No authentication needed. Just read the local file.

```bash
# macOS location
GRANOLA_CACHE=~/Library/Application\ Support/Granola/cache-v3.json

# Windows location
# %APPDATA%\Granola\cache-v3.json

# Linux location
# ~/.config/Granola/cache-v3.json

# Verify it exists
ls -la "$GRANOLA_CACHE"
```

```typescript
// TypeScript: Load and parse Granola cache
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface GranolaDocument {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  google_event_id?: string;
  transcript?: string;
  last_viewed_panel?: {
    content: unknown; // ProseMirror JSON
  };
}

function loadGranolaCache() {
  const cachePath = join(
    homedir(),
    'Library/Application Support/Granola/cache-v3.json'
  );

  const raw = readFileSync(cachePath, 'utf-8');
  const data = JSON.parse(raw);

  // Cache uses double-JSON encoding
  const cacheData = JSON.parse(data.cache);
  const state = cacheData.state;

  return {
    documents: state.documents as Record<string, GranolaDocument>,
    meetingsMetadata: state.meetingsMetadata,
    transcripts: state.transcripts,
  };
}
```

### Method 2: Unofficial API Access

Extract tokens from local files and use the private API.

```bash
# Extract access token (macOS)
TOKEN=$(cat ~/Library/Application\ Support/Granola/supabase.json | \
  jq -r '.workos_tokens | fromjson | .access_token')

# Test API access
curl -X POST https://api.granola.ai/v2/get-documents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 10, "offset": 0}'
```

```typescript
// TypeScript: API access with token extraction
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

function getGranolaToken(): string {
  const tokenPath = join(
    homedir(),
    'Library/Application Support/Granola/supabase.json'
  );

  const data = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const workosTokens = JSON.parse(data.workos_tokens);

  return workosTokens.access_token;
}

async function fetchDocuments(limit = 10, offset = 0) {
  const token = getGranolaToken();

  const response = await fetch('https://api.granola.ai/v2/get-documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit, offset }),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

### Method 3: Zapier Integration (Official)

For paid Granola users, Zapier provides event-driven automation.

1. Go to Granola Settings → Zapier
2. Connect your Zapier account
3. Available triggers:
   - **Note Added to Folder** — Fires when note added to specific folder
   - **Note Shared to Zapier** — Fires on manual share from sidebar

## Core Usage Patterns

### Pattern 1: List All Meetings

Get all meetings from the local cache.

```typescript
function listMeetings() {
  const { documents } = loadGranolaCache();

  return Object.values(documents)
    .map(doc => ({
      id: doc.id,
      title: doc.title,
      date: new Date(doc.created_at),
      hasTranscript: !!doc.transcript,
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

// Usage
const meetings = listMeetings();
console.log(`Found ${meetings.length} meetings`);
meetings.slice(0, 5).forEach(m => {
  console.log(`- ${m.title} (${m.date.toLocaleDateString()})`);
});
```

### Pattern 2: Search Meetings by Content

Fuzzy search across titles, participants, and transcript content.

```typescript
function searchMeetings(query: string) {
  const { documents, transcripts } = loadGranolaCache();
  const queryLower = query.toLowerCase();

  return Object.values(documents).filter(doc => {
    // Search title
    if (doc.title?.toLowerCase().includes(queryLower)) return true;

    // Search transcript
    const transcript = transcripts[doc.id];
    if (transcript?.text?.toLowerCase().includes(queryLower)) return true;

    return false;
  });
}

// Usage
const results = searchMeetings('product roadmap');
console.log(`Found ${results.length} matches`);
```

### Pattern 3: Get Meeting with Full Transcript

Retrieve complete meeting details including transcript.

```typescript
interface TranscriptSegment {
  speaker: string;
  text: string;
  start_time: number;
  end_time: number;
}

function getMeetingDetails(meetingId: string) {
  const { documents, transcripts, meetingsMetadata } = loadGranolaCache();

  const doc = documents[meetingId];
  if (!doc) throw new Error(`Meeting not found: ${meetingId}`);

  const transcript = transcripts[meetingId];
  const metadata = meetingsMetadata[doc.google_event_id];

  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    attendees: metadata?.attendees || [],
    transcript: transcript?.segments as TranscriptSegment[] | undefined,
    notes: extractNotesContent(doc.last_viewed_panel),
  };
}

function extractNotesContent(panel: unknown): string {
  // ProseMirror JSON to plain text conversion
  if (!panel || typeof panel !== 'object') return '';

  const content = (panel as any).content;
  if (!Array.isArray(content)) return '';

  return content
    .map(node => extractTextFromNode(node))
    .join('\n');
}

function extractTextFromNode(node: any): string {
  if (node.type === 'text') return node.text || '';
  if (node.content) {
    return node.content.map(extractTextFromNode).join('');
  }
  return '';
}
```

### Pattern 4: Export Meeting to Markdown

Convert a meeting to a markdown file for Obsidian/Notion.

```typescript
function exportToMarkdown(meetingId: string): string {
  const meeting = getMeetingDetails(meetingId);

  const lines = [
    '---',
    `title: "${meeting.title}"`,
    `date: ${meeting.createdAt}`,
    `granola_id: ${meeting.id}`,
    '---',
    '',
    `# ${meeting.title}`,
    '',
  ];

  if (meeting.attendees.length > 0) {
    lines.push('## Attendees');
    meeting.attendees.forEach(a => lines.push(`- ${a.name || a.email}`));
    lines.push('');
  }

  if (meeting.notes) {
    lines.push('## Notes');
    lines.push(meeting.notes);
    lines.push('');
  }

  if (meeting.transcript) {
    lines.push('## Transcript');
    meeting.transcript.forEach(seg => {
      lines.push(`**${seg.speaker}:** ${seg.text}`);
    });
  }

  return lines.join('\n');
}

// Usage
import { writeFileSync } from 'fs';
const markdown = exportToMarkdown('meeting-123');
writeFileSync('./meeting.md', markdown);
```

### Pattern 5: Using the MCP Server with Claude

Set up the community MCP server for Claude Desktop integration.

```bash
# Clone and install
git clone https://github.com/nehiljain/granola-ai-mcp-server
cd granola-ai-mcp-server
uv sync

# Test CLI
uv run granola list
uv run granola search "quarterly review"
```

```json
// Add to ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "granola": {
      "command": "uv",
      "args": [
        "--directory", "/path/to/granola-ai-mcp-server",
        "run", "granola-mcp-server"
      ]
    }
  }
}
```

Now in Claude Desktop, you can ask:
- "What meetings did I have last week?"
- "Find discussions about the product roadmap"
- "Summarize my meeting with John on Tuesday"

## Anti-Patterns & Pitfalls

### Don't: Assume Tokens Are Long-Lived

```typescript
// BAD - Token cached and reused
const TOKEN = getGranolaToken(); // Called once at startup

async function fetchMeetings() {
  return fetch('https://api.granola.ai/v2/get-documents', {
    headers: { 'Authorization': `Bearer ${TOKEN}` }, // Will expire!
  });
}
```

**Why it's wrong:** WorkOS tokens expire frequently (often within a day). The Granola app handles automatic refresh, but extracted tokens go stale[5].

### Instead: Re-read Token Each Request or Use Cache

```typescript
// GOOD - Fresh token each time
async function fetchMeetings() {
  const token = getGranolaToken(); // Fresh read
  return fetch('https://api.granola.ai/v2/get-documents', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
}

// BETTER - Use local cache (no auth needed)
function getMeetings() {
  return loadGranolaCache().documents;
}
```

---

### Don't: Depend on Cache Format Stability

```typescript
// BAD - Assuming specific structure
const meetings = cache.state.documents; // What if this changes?
const title = meetings[id].title; // What if field renamed?
```

**Why it's wrong:** The cache format is undocumented and can change with any Granola update. You're reverse-engineering internal data structures[2].

### Instead: Validate and Handle Missing Fields

```typescript
// GOOD - Defensive parsing
function parseDocument(doc: unknown): GranolaDocument | null {
  if (!doc || typeof doc !== 'object') return null;

  const d = doc as Record<string, unknown>;

  return {
    id: String(d.id || ''),
    title: String(d.title || 'Untitled'),
    created_at: String(d.created_at || new Date().toISOString()),
    updated_at: String(d.updated_at || ''),
    transcript: d.transcript as string | undefined,
  };
}
```

---

### Don't: Write to the Cache File

```typescript
// BAD - Modifying Granola's data
const cache = loadGranolaCache();
cache.documents['new-meeting'] = { ... };
writeFileSync(CACHE_PATH, JSON.stringify(cache)); // DANGER!
```

**Why it's wrong:** The cache is managed by the Granola app. Writing to it could corrupt data, cause sync issues, or crash the app.

### Instead: Export to Separate Files

```typescript
// GOOD - Read-only from Granola, write elsewhere
const meetings = loadGranolaCache().documents;
const exported = Object.values(meetings).map(exportToMarkdown);
exported.forEach((md, i) => writeFileSync(`./export/${i}.md`, md));
```

---

### Don't: Rely on This for Production Apps

```typescript
// BAD - Building commercial product on unofficial API
class MeetingAnalyticsService {
  async getMeetings() {
    return fetch('https://api.granola.ai/v2/get-documents', ...);
  }
}
// This could break at any time!
```

**Why it's wrong:** Granola explicitly doesn't support public API access. They could change endpoints, block external access, or rate-limit at any time.

### Instead: Use Official Integrations for Production

```typescript
// GOOD - Use Zapier for event-driven workflows
// Set up Zap: Granola → Webhook → Your Server

// Your webhook handler
app.post('/granola-webhook', (req, res) => {
  const { meeting_title, notes, attendees } = req.body;
  // Process meeting data...
});
```

## Why This Choice

### Decision Criteria

| Criterion | Weight | Local Cache | Unofficial API | Zapier |
|-----------|--------|-------------|----------------|--------|
| Reliability | High | Excellent (local file) | Poor (tokens expire) | Good (official) |
| Data completeness | High | Full history | Full history | Per-event only |
| Setup complexity | Medium | Trivial | Moderate | Easy |
| Official support | Medium | No | No | Yes |
| Works offline | Low | Yes | No | No |
| Real-time events | Low | No (polling) | No | Yes |

### Key Factors

- **Local cache is most reliable:** No network, no auth, no rate limits. Just read a JSON file.
- **API tokens expire too fast:** WorkOS tokens have short lifespans, making the unofficial API fragile for automation.
- **Zapier is the official path:** For event-driven workflows, Zapier is supported and won't break unexpectedly.

## Alternatives Considered

### Zapier Integration

- **What it is:** Official Granola integration with 8,000+ apps via Zapier
- **Why not primary choice:** Only works for paid users, event-driven only (can't query historical data), requires Zapier subscription
- **Choose this instead when:**
  - You need official, supported integration
  - You want real-time triggers when meetings end
  - You're connecting to CRMs (HubSpot, Salesforce, Attio)
- **Key tradeoff:** Official but limited to events, can't query history

### Unofficial API

- **What it is:** REST API at `api.granola.ai` using extracted WorkOS tokens
- **Why not primary choice:** Tokens expire frequently, no official support, could break anytime
- **Choose this instead when:**
  - You need absolutely fresh data (cache might lag by minutes)
  - You're building a proof-of-concept you control
- **Key tradeoff:** Fresher data but fragile authentication

### Otter.ai / Fireflies.ai

- **What it is:** Competing meeting notes tools with their own APIs
- **Why not chosen:** Different products; if you're using Granola, you want Granola data
- **Choose this instead when:**
  - You're starting fresh and need an API-first meeting tool
  - You need bots to join meetings (Granola is bot-free)
- **Key tradeoff:** Better API support but different product philosophy

### Request Official API Access

- **What it is:** Email hey@granola.so to request API access
- **Why not chosen:** They've stated no public API plans currently[1]
- **Choose this instead when:**
  - You're an enterprise with leverage
  - You're willing to wait for their roadmap
- **Key tradeoff:** Could get official support, but may never happen

## Caveats & Limitations

- **No official API:** Everything here is reverse-engineered. Granola could change formats at any time[1]
- **Cache freshness:** Local cache may lag cloud by minutes. Granola syncs in the background, but timing is unpredictable[2]
- **Token rotation:** WorkOS uses one-time refresh tokens. Each token exchange invalidates the previous one[5]
- **macOS-focused:** Most tooling assumes macOS paths. Windows/Linux paths differ
- **ProseMirror format:** Notes are stored in ProseMirror's JSON format, which requires parsing[3]
- **No write access:** You can read meetings but cannot create/modify via any method
- **Paid features:** Zapier integration requires Granola paid plan[4]

## References

[1] [Granola Help Center - Integrations](https://help.granola.ai/article/integrations-with-granola) - Official statement on API plans and available integrations

[2] [Cobble Hill - Granola Claude MCP Integration](https://cobblehilldigital.com/articles/how-to-build-a-custom-granola-claude-mcp-integration-for-ai-powered-meeting-intelligence) - Detailed guide on cache structure and MCP implementation

[3] [Joseph Thacker - Reverse Engineering Granola](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) - Original reverse engineering article with token extraction

[4] [Granola Zapier Help](https://help.granola.ai/article/zapier) - Official Zapier integration setup

[5] [Reverse Engineering Granola API (GitHub)](https://github.com/getprobo/reverse-engineering-granola-api) - Community API documentation with authentication details

[6] [granola-ai-mcp-server (GitHub)](https://github.com/nehiljain/granola-ai-mcp-server) - MCP server for Claude Desktop integration

[7] [granola-export-tool (GitHub)](https://github.com/haasonsaas/granola-export-tool) - CLI tool for bulk export

[8] [Raycast Granola Extension](https://www.raycast.com/Rob/granola) - Raycast integration documentation

[9] [GranolaObsidian (GitHub)](https://github.com/coopersmith/GranolaObsidian) - Obsidian sync plugin with token extraction

[10] [Granola Blog - Zapier Integration](https://www.granola.ai/blog/your-meeting-notes-now-connected-with-8000-apps) - Official announcement of Zapier support

[11] [Granola Help - Feature Requests](https://help.granola.ai/article/feature-requests) - Company roadmap and contact for API requests

[12] [Granola Review - BlueDot](https://www.bluedothq.com/blog/granola-review) - Third-party review discussing API limitations
