---
name: Granola Meeting Notes
description: This skill should be used when the user asks about "meeting notes", "what did we discuss", "find meeting", "show meeting", "recent meetings", "meeting transcript", "export meeting", "search meetings", "who was in the meeting", "yesterday's meeting", "last week's calls", or mentions Granola, meeting summaries, or wants to access meeting history. Provides access to Granola meeting notes, transcripts, and summaries.
version: 0.1.0
---

# Granola Meeting Notes

Access your Granola meeting notes, transcripts, and summaries directly from Claude Code. This skill reads Granola's local cache file - no API keys or authentication required.

## Prerequisites

- Granola desktop app installed on macOS
- At least one meeting recorded in Granola

## Available Commands

### List Recent Meetings

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js list [--days N]
```

Lists meetings from the last N days (default: 7).

**Examples:**
```bash
# List last 7 days
${CLAUDE_PLUGIN_ROOT}/bin/granola.js list

# List last 30 days
${CLAUDE_PLUGIN_ROOT}/bin/granola.js list --days 30
```

### Show Meeting Details

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js show <meeting-id> [--transcript]
```

Shows full details for a specific meeting. Use partial IDs (first 8 characters work).

**Examples:**
```bash
# Show meeting notes
${CLAUDE_PLUGIN_ROOT}/bin/granola.js show 02b2432a

# Include full transcript
${CLAUDE_PLUGIN_ROOT}/bin/granola.js show 02b2432a --transcript
```

### Search Meetings

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js search <query>
```

Search meetings by title, notes content, or participant names/emails.

**Examples:**
```bash
# Search by topic
${CLAUDE_PLUGIN_ROOT}/bin/granola.js search "product review"

# Search by person
${CLAUDE_PLUGIN_ROOT}/bin/granola.js search "john@example.com"
```

### Export to Markdown

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js export <meeting-id> [--output DIR]
```

Exports a meeting to a markdown file with YAML frontmatter, notes, and transcript.

**Examples:**
```bash
# Export to default directory
${CLAUDE_PLUGIN_ROOT}/bin/granola.js export 02b2432a

# Export to specific directory
${CLAUDE_PLUGIN_ROOT}/bin/granola.js export 02b2432a --output ./meetings
```

## Common Workflows

### "What did we discuss in yesterday's meeting?"

1. List recent meetings to find the ID
2. Show the meeting with notes and transcript

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js list --days 2
${CLAUDE_PLUGIN_ROOT}/bin/granola.js show <id> --transcript
```

### "Find all meetings with John about the project"

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js search "John"
${CLAUDE_PLUGIN_ROOT}/bin/granola.js show <id>
```

### "Export last week's meetings for the report"

```bash
${CLAUDE_PLUGIN_ROOT}/bin/granola.js list --days 7
# Export each relevant meeting
${CLAUDE_PLUGIN_ROOT}/bin/granola.js export <id1> --output ./weekly-report
${CLAUDE_PLUGIN_ROOT}/bin/granola.js export <id2> --output ./weekly-report
```

## Output Format

- **List**: Markdown-formatted list with meeting title, ID, date, and participants
- **Show**: Full markdown document with metadata, summary, notes, and optional transcript
- **Search**: Condensed list of matching meetings
- **Export**: Markdown file with YAML frontmatter for use in Obsidian, Notion, etc.

## Limitations

- Only works on macOS (where Granola stores its cache)
- Reads from local cache - may not include very old meetings
- Transcript availability depends on meeting recording settings
