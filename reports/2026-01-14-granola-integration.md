---
title: "Granola Notes Integration: Local Cache & API Access"
date: 2026-01-14
topic: granola-integration
recommendation: GranolaMCP (Python) or Local Cache Access
version_researched: Granola 5.354.0+
use_when:
  - You need programmatic access to Granola meeting notes and transcripts
  - Building automation workflows for meeting data
  - Integrating meeting intelligence into Claude Code or other AI tools
  - Exporting notes to Obsidian, Notion, or custom formats
avoid_when:
  - You only need manual one-off exports (use built-in sharing)
  - You require official API support with SLA guarantees
  - You need real-time webhook triggers on new meetings
project_context:
  language: Python, Go, TypeScript
  relevant_dependencies: MCP server, Raycast extension, Obsidian plugins
---

## Summary

Granola is an AI-powered meeting notes application that captures audio directly from your device (without joining as a bot), transcribes meetings, and generates AI summaries[1]. **Granola does not offer a public API**[2], but several community-developed approaches exist to access your notes programmatically.

The recommended approach is **reading Granola's local cache file** (`cache-v3.json`) which contains all meeting data including transcripts, notes, and metadata[3]. Multiple MCP servers and CLI tools have been built around this approach, with GranolaMCP being the most comprehensive[4]. For API-based access, the undocumented Granola API has been reverse-engineered[5], though this approach requires managing OAuth token rotation and may break with app updates.

**Key Metrics:**
- GranolaMCP: Python-based, 10 MCP tools, CLI interface, 0 external dependencies[4]
- proofgeist/granola-ai-mcp-server: TypeScript-based, 5 MCP tools, Claude Desktop optimized[6]
- theantichris/granola: Go-based CLI for markdown export[7]
- Multiple Obsidian sync plugins available[8][9]

## Philosophy & Mental Model

Granola's architecture differs fundamentally from competitors like Otter.ai or Fireflies. Instead of joining meetings as a bot participant, Granola captures audio at the system level on your Mac or Windows machine[1]. This means:

1. **Local-First Data**: Meeting recordings and transcripts are processed and cached locally before syncing to Granola's cloud
2. **No Bot Presence**: Other participants never see a "Granola Bot" joining
3. **Offline Access**: The local cache (`cache-v3.json`) contains your meeting history even without internet

The mental model for integration is: **Granola as a local database of meeting intelligence**. Your options are:

- **Cache Reading** (Recommended): Parse the local JSON cache directly - fast, offline, no auth needed
- **API Access** (Advanced): Use reverse-engineered endpoints with OAuth rotation - more complete data, but fragile
- **Zapier/Native Integrations**: Use official integrations for simple workflows - limited but stable

**Note on AppleScript**: Granola does not expose an AppleScript dictionary. As an Electron app, it lacks native macOS scripting support. UI scripting via System Events is possible but brittle and not recommended[10].

## Setup

### Option 1: GranolaMCP (Recommended for Claude Code)

```bash
# Install from PyPI
pip install granola-mcp

# Or from source
git clone https://github.com/pedramamini/GranolaMCP.git
cd GranolaMCP
pip install -e .
```

Create a `.env` file:
```bash
GRANOLA_CACHE_PATH=/Users/YOUR_USERNAME/Library/Application Support/Granola/cache-v3.json
```

Configure for Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "granola": {
      "command": "python",
      "args": ["-m", "granola_mcp"],
      "env": {
        "GRANOLA_CACHE_PATH": "/Users/YOUR_USERNAME/Library/Application Support/Granola/cache-v3.json"
      }
    }
  }
}
```

### Option 2: Direct Cache Access (Custom Scripts)

The cache file location:
- **macOS**: `~/Library/Application Support/Granola/cache-v3.json`
- **Windows**: `%APPDATA%\Granola\cache-v3.json`

```python
import json
from pathlib import Path

# Load the cache
cache_path = Path.home() / "Library/Application Support/Granola/cache-v3.json"
with open(cache_path) as f:
    cache = json.load(f)

# The cache contains a double-JSON structure - parse inner JSON
meetings = cache.get("meetings", [])
for meeting in meetings:
    print(f"Title: {meeting.get('title')}")
    print(f"Date: {meeting.get('created_at')}")
```

### Option 3: API Access (Advanced)

Credentials location:
```
~/Library/Application Support/Granola/supabase.json
```

```python
import json
import requests
from pathlib import Path

# Load credentials
creds_path = Path.home() / "Library/Application Support/Granola/supabase.json"
with open(creds_path) as f:
    creds = json.load(f)

# Extract WorkOS tokens (nested JSON string)
workos_tokens = json.loads(creds.get("workos_tokens", "{}"))
access_token = workos_tokens.get("access_token")

# API call
headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json",
    "User-Agent": "Granola/5.354.0",
    "X-Client-Version": "5.354.0"
}

response = requests.post(
    "https://api.granola.ai/v2/get-documents",
    headers=headers,
    json={"limit": 100, "offset": 0, "include_last_viewed_panel": True}
)

documents = response.json()
```

## Core Usage Patterns

### Pattern 1: List Recent Meetings (CLI)

Use GranolaMCP's CLI for quick access to meeting data:

```bash
# List meetings from last 7 days
granola list --last 7d

# Filter by participant
granola list --participant "John Smith" --last 30d

# Show detailed meeting info
granola show <meeting-id> --transcript

# Export to markdown
granola export <meeting-id> --output ./exports/
```

### Pattern 2: Search Meetings (Python API)

```python
from granola_mcp import GranolaParser
from granola_mcp.core.meeting import Meeting

parser = GranolaParser()
meetings = parser.get_meetings()

# Search by title
for meeting_data in meetings:
    meeting = Meeting(meeting_data)
    if "quarterly review" in meeting.title.lower():
        print(f"Found: {meeting.title}")
        print(f"Date: {meeting.date}")
        print(f"Participants: {meeting.participants}")

        if meeting.has_transcript():
            transcript = meeting.transcript
            print(f"Word count: {transcript.word_count}")
```

### Pattern 3: Export Notes to Markdown

```python
from granola_mcp import GranolaParser
from granola_mcp.core.meeting import Meeting
from pathlib import Path

parser = GranolaParser()
meetings = parser.get_meetings()

output_dir = Path("./granola_exports")
output_dir.mkdir(exist_ok=True)

for meeting_data in meetings[:10]:  # Last 10 meetings
    meeting = Meeting(meeting_data)

    # Create markdown with frontmatter
    md_content = f"""---
id: {meeting.id}
title: {meeting.title}
date: {meeting.date}
participants: {', '.join(meeting.participants)}
---

# {meeting.title}

## Summary
{meeting.summary or 'No summary available'}

## Notes
{meeting.notes or 'No notes available'}

## Transcript
{meeting.transcript.text if meeting.has_transcript() else 'No transcript'}
"""

    filename = f"{meeting.date.strftime('%Y-%m-%d')}-{meeting.id[:8]}.md"
    (output_dir / filename).write_text(md_content)
```

### Pattern 4: MCP Integration with Claude

When configured as an MCP server, use natural language queries:

```
User: "What did we discuss in yesterday's meeting with the product team?"

Claude: [Uses search_meetings tool with query="product team" and date filter]
        [Uses get_transcript tool for matching meeting]

        "In yesterday's product team meeting, you discussed..."
```

### Pattern 5: Token Refresh for API Access

The Granola API uses WorkOS OAuth with **rotating refresh tokens** - each token is valid for ONE use only[5]:

```python
import json
import requests
from pathlib import Path

def refresh_token():
    creds_path = Path.home() / "Library/Application Support/Granola/supabase.json"
    with open(creds_path) as f:
        creds = json.load(f)

    workos_tokens = json.loads(creds.get("workos_tokens", "{}"))

    response = requests.post(
        "https://api.workos.com/user_management/authenticate",
        json={
            "client_id": workos_tokens.get("client_id"),
            "grant_type": "refresh_token",
            "refresh_token": workos_tokens.get("refresh_token")
        }
    )

    new_tokens = response.json()

    # CRITICAL: Save the new refresh token - old one is now invalid!
    workos_tokens["access_token"] = new_tokens["access_token"]
    workos_tokens["refresh_token"] = new_tokens["refresh_token"]
    creds["workos_tokens"] = json.dumps(workos_tokens)

    with open(creds_path, "w") as f:
        json.dump(creds, f)

    return new_tokens["access_token"]
```

## Anti-Patterns & Pitfalls

### Don't: Reuse Refresh Tokens

```python
# BAD - This will fail after first use
def get_documents():
    token = load_saved_token()  # Reusing old token
    response = requests.post(url, headers={"Authorization": f"Bearer {token}"})
    return response.json()  # Will get 401 after first call!
```

**Why it's wrong:** Granola's OAuth implementation invalidates refresh tokens after each use. Attempting to reuse a token triggers authentication failure[5].

### Instead: Always Persist New Tokens

```python
# GOOD - Persist tokens after every refresh
def get_documents():
    tokens = refresh_and_save_tokens()  # Returns new tokens, saves them
    response = requests.post(url, headers={"Authorization": f"Bearer {tokens['access_token']}"})
    return response.json()
```

---

### Don't: Parse Cache Without Handling Double-JSON

```python
# BAD - Treats cache as simple JSON
with open(cache_path) as f:
    meetings = json.load(f)["meetings"]  # May fail or return wrong structure
```

**Why it's wrong:** The cache uses a "complex double-JSON structure" where some values are JSON strings that need secondary parsing[4].

### Instead: Use GranolaMCP's Parser

```python
# GOOD - Handles cache complexity
from granola_mcp import GranolaParser

parser = GranolaParser()  # Handles double-JSON automatically
meetings = parser.get_meetings()
```

---

### Don't: Rely on AppleScript for Granola Automation

```applescript
-- BAD - Granola has no AppleScript dictionary
tell application "Granola"
    get every document  -- Will fail!
end tell
```

**Why it's wrong:** Granola is an Electron app without AppleScript support. It doesn't expose a scripting dictionary[10].

### Instead: Use Local Cache or API

```python
# GOOD - Access data directly
from granola_mcp import GranolaParser
parser = GranolaParser()
meetings = parser.get_meetings()
```

---

### Don't: Hardcode Token Expiration Assumptions

```python
# BAD - Assumes token validity
def make_request():
    if not token_expired():  # Dangerous assumption
        return call_api()
```

**Why it's wrong:** Access tokens expire in 3600 seconds, but refresh tokens are one-time-use. Checking expiration alone isn't sufficient[5].

### Instead: Handle Auth Errors Gracefully

```python
# GOOD - Refresh on 401
def make_request():
    response = call_api()
    if response.status_code == 401:
        refresh_tokens()
        response = call_api()
    return response
```

## Why This Choice

### Decision Criteria

| Criterion | Weight | GranolaMCP (Cache) | API Access | Zapier |
|-----------|--------|-------------------|------------|--------|
| Reliability | High | Excellent - local file | Medium - may break | High - official |
| Data Completeness | High | Full transcripts/notes | Full data | Limited |
| Setup Complexity | Medium | Simple - pip install | Complex - OAuth | Simple |
| Offline Access | Medium | Yes | No | No |
| Future Compatibility | Medium | Good - cache format stable | Poor - undocumented | Good |
| Real-time Triggers | Low | No | No | Yes |

### Key Factors

- **Reliability**: Cache-based access doesn't depend on undocumented API endpoints that could change
- **Data Completeness**: Local cache contains everything - full transcripts, AI summaries, notes, metadata
- **Claude Code Integration**: GranolaMCP provides ready-to-use MCP tools for seamless integration
- **No Auth Complexity**: Cache access requires no token management or OAuth rotation

## Alternatives Considered

### Alternative 1: Direct API Access

- **What it is:** Using reverse-engineered Granola API endpoints directly
- **Why not primary:** Requires complex OAuth token rotation, may break with app updates
- **Choose this instead when:**
  - You need data that's not in the local cache
  - You're building a web service without local file access
  - You need to modify data (not just read)
- **Key tradeoff:** More complete data access vs. fragility and complexity

### Alternative 2: Zapier Integration

- **What it is:** Official Granola + Zapier connection for 8000+ app workflows[2]
- **Why not primary:** Can't pull arbitrary notes programmatically, limited to trigger-based workflows
- **Choose this instead when:**
  - You need simple "new meeting -> action" automations
  - Official support and stability matter more than flexibility
  - You're connecting to apps Zapier supports (Notion, Slack, etc.)
- **Key tradeoff:** Official support vs. limited programmability

### Alternative 3: Raycast Extension

- **What it is:** Granola extension for Raycast launcher[11]
- **Why not primary:** Requires Raycast, designed for interactive use not scripting
- **Choose this instead when:**
  - You're a Raycast user wanting quick meeting access
  - You need bulk export with folder filtering
  - Interactive search is more important than automation
- **Key tradeoff:** Great UX vs. not scriptable

### Alternative 4: Obsidian Plugins

- **What it is:** Plugins to sync Granola notes to Obsidian vault[8][9]
- **Why not primary:** Obsidian-specific, not general-purpose
- **Choose this instead when:**
  - Your goal is specifically Obsidian integration
  - You want automatic sync without custom code
- **Key tradeoff:** Turnkey Obsidian sync vs. locked to one destination

## Caveats & Limitations

- **No Official API**: All programmatic access methods are unofficial and may break. Granola has stated they're "exploring" API/MCP options but haven't committed[2].

- **Cache Behavior Unknown**: The exact sync behavior between local cache and cloud is undocumented. Cache may not include very old meetings or may use a rolling window[6].

- **Token Rotation Complexity**: If using API access, the one-time-use refresh token pattern requires careful state management. Race conditions in concurrent access could invalidate your tokens.

- **macOS/Windows Only**: Granola desktop app (and thus local cache) is only available on macOS and Windows. iOS data syncs but there's no local cache on mobile.

- **ProseMirror Format**: Notes are stored in ProseMirror JSON format, requiring conversion to Markdown or other formats[5][7].

- **No Real-time Triggers**: Neither cache reading nor API polling provides webhooks or real-time notifications when new meetings finish. Zapier offers the closest to this via triggers.

- **Electron App Limitations**: No AppleScript support, no URL schemes, no native macOS automation hooks[10].

## References

[1] [Granola Official Website](https://www.granola.ai/) - Overview of Granola's audio capture and AI summarization approach

[2] [Granola Help Center - Integrations](https://help.granola.ai/article/integrations-with-granola) - Official integration options and API status ("no public API currently")

[3] [GranolaMCP GitHub](https://github.com/pedramamini/GranolaMCP) - Python library for cache-based access with CLI and MCP tools

[4] [GranolaMCP on Awesome MCP Servers](https://mcpservers.org/servers/pedramamini/GranolaMCP) - Documentation of 10 available MCP tools and cache parsing

[5] [Reverse Engineering Granola to Get Notes in Obsidian](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) - Joseph Thacker's technical breakdown of API endpoints and OAuth flow

[6] [proofgeist/granola-ai-mcp-server](https://github.com/proofgeist/granola-ai-mcp-server) - TypeScript MCP server optimized for Claude Desktop

[7] [theantichris/granola](https://github.com/theantichris/granola) - Go-based CLI for exporting notes to Markdown

[8] [obsidian-granola-sync](https://github.com/tomelliot/obsidian-granola-sync) - Obsidian plugin for Granola sync with credential handling

[9] [Granola-to-Obsidian](https://github.com/dannymcc/Granola-to-Obsidian) - Alternative Obsidian plugin with frontmatter support

[10] [Mac Automation Scripting Guide](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/AutomatetheUserInterface.html) - Apple's documentation on UI scripting limitations for Electron apps

[11] [Raycast Granola Extension](https://www.raycast.com/Rob/granola) - Raycast extension with search, export, and AI features

[12] [Zapier: What is Granola?](https://zapier.com/blog/granola-ai/) - Overview of Granola features and Zapier integration capabilities

[13] [getprobo/reverse-engineering-granola-api](https://github.com/getprobo/reverse-engineering-granola-api) - Comprehensive API documentation with Python examples
