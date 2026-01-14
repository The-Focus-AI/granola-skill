# granola-skill

A Claude Code plugin for accessing Granola meeting notes, transcripts, and summaries.

## Features

- **List meetings** - View recent meetings with participants and dates
- **Show meeting details** - See full notes and transcripts
- **Search meetings** - Find meetings by title, content, or participant
- **Export to markdown** - Create markdown files with YAML frontmatter

## Installation

```bash
# Clone the repo
git clone https://github.com/The-Focus-AI/granola-skill.git

# Install dependencies
cd granola-skill
pnpm install

# Build
pnpm run build

# Install as Claude Code plugin
claude /plugin install ./
```

## Requirements

- macOS with Granola desktop app installed
- Node.js 18+
- Claude Code

## Usage

Once installed, the skill activates automatically when you mention:
- "meeting notes"
- "what did we discuss"
- "find meeting"
- "meeting transcript"
- "recent meetings"

### CLI Commands

```bash
# List recent meetings
./bin/granola.js list --days 7

# Show meeting with transcript
./bin/granola.js show <meeting-id> --transcript

# Search meetings
./bin/granola.js search "product review"

# Export to markdown
./bin/granola.js export <meeting-id> --output ./meetings
```

## How It Works

This skill reads Granola's local cache file (`~/Library/Application Support/Granola/cache-v3.json`) directly. No API keys or authentication required.

The cache uses a double-JSON structure - the outer JSON contains a `cache` key whose value is a JSON string that must be parsed separately.

## License

MIT
