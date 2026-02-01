# Granola API Endpoints Reference

*Date: 2026-01-31 | Based on live testing*

## Authentication

Tokens are stored locally by the Granola desktop app:

```bash
# Extract access token
TOKEN=$(cat "/Users/$USER/Library/Application Support/Granola/supabase.json" | \
  jq -r '.workos_tokens | fromjson | .access_token')
```

All requests require these headers (discovered from [granola-export-tool](https://github.com/haasonsaas/granola-export-tool)):

```bash
-H "Authorization: Bearer $TOKEN"
-H "Content-Type: application/json"
-H "Accept: */*"
-H "User-Agent: Granola/5.354.0"
-H "X-Client-Version: 5.354.0"
--compressed  # Response is gzip encoded
```

**Critical:** The `User-Agent` and `X-Client-Version` headers are required. Without them, the API returns "Unsupported client".

**Token expiration:** Tokens expire in ~6 hours (`expires_in: 21599` seconds). When the Granola desktop app refreshes its token, any previously extracted token becomes invalid. You'll get "Unauthorized" errors.

## Working Endpoints

### GET Documents (Paginated)

```bash
POST https://api.granola.ai/v2/get-documents
```

```json
{"limit": 10, "offset": 0}
```

Returns your documents (NOT shared documents from others).

**Response:**
```json
{
  "deleted": [],
  "docs": [
    {
      "id": "uuid",
      "title": "Meeting Title",
      "created_at": "2026-01-31T...",
      "workspace_id": "uuid",
      "notes_markdown": "...",
      "summary": "...",
      "people": {...},
      // ... 40+ fields
    }
  ]
}
```

---

### GET Workspaces

```bash
POST https://api.granola.ai/v1/get-workspaces
```

```json
{}
```

Returns all workspaces (organizations) you have access to.

**Response:**
```json
{
  "workspaces": [
    {
      "workspace": {
        "workspace_id": "uuid",
        "slug": "thefocus.ai",
        "display_name": "The Focus AI",
        "privacy_mode_enabled": true,
        "allow_moving_notes": true,
        "allow_data_export": true,
        // ...
      },
      "role": "admin",
      "plan_type": "free"
    }
  ]
}
```

---

### GET Folders (Document Lists)

```bash
POST https://api.granola.ai/v2/get-document-lists
```

```json
{}
```

Returns all folders with their documents. This is how you access shared folders.

**Response:**
```json
{
  "lists": [
    {
      "id": "uuid",
      "title": "Folder Name",
      "description": null,
      "icon": {"type": "icon", "color": "gray", "value": "FolderIcon"},
      "parent_document_list_id": null,
      "sort_order": -1,
      "documents": [
        {
          "id": "uuid",
          "title": "Meeting in Folder",
          "created_at": "...",
          "notes_plain": "...",
          // partial document data
        }
      ]
    }
  ]
}
```

**Note:** v1 endpoint also exists but may return different results. Try v2 first.

---

### GET Documents by ID (Batch)

```bash
POST https://api.granola.ai/v1/get-documents-batch
```

```json
{"document_ids": ["uuid1", "uuid2"]}
```

Fetches specific documents by ID. **This is the way to get shared documents** that don't appear in `get-documents`.

**Response:**
```json
{
  "docs": [
    {
      "id": "uuid",
      "title": "...",
      // full document data
    }
  ]
}
```

---

### GET Transcript

```bash
POST https://api.granola.ai/v1/get-document-transcript
```

```json
{"document_id": "uuid"}
```

Returns transcript segments for a meeting.

**Response (array):**
```json
[
  {
    "id": "uuid",
    "document_id": "uuid",
    "start_timestamp": "2026-01-26T19:31:27.299Z",
    "end_timestamp": "2026-01-26T19:31:29.779Z",
    "text": "What's up?",
    "source": "microphone",  // or "system" for remote audio
    "is_final": true
  }
]
```

## API Version Matrix

| Endpoint | v1 | v2 |
|----------|----|----|
| `get-documents` | "Unsupported client" | **Works** |
| `get-workspaces` | **Works** | Not Found |
| `get-document-lists` | Works | **Works** (preferred) |
| `get-documents-batch` | **Works** | Bad Request |
| `get-document-transcript` | **Works** | Untested |

Granola is migrating endpoints incrementally. Use the version marked as working.

## Accessing Shared Folders Workflow

1. **Get folders:** `POST /v2/get-document-lists` returns folder metadata with document IDs
2. **Get full documents:** `POST /v1/get-documents-batch` with the document IDs from step 1
3. **Get transcripts:** `POST /v1/get-document-transcript` for each document

```bash
# Example: Get all documents from a shared folder
TOKEN=$(cat "/Users/$USER/Library/Application Support/Granola/supabase.json" | \
  jq -r '.workos_tokens | fromjson | .access_token')

# 1. Get folder with document IDs
FOLDER_DATA=$(curl -s --compressed -X POST "https://api.granola.ai/v2/get-document-lists" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}')

# 2. Extract document IDs from first folder
DOC_IDS=$(echo "$FOLDER_DATA" | jq -r '.lists[0].documents[].id')

# 3. Fetch full document data
curl -s --compressed -X POST "https://api.granola.ai/v1/get-documents-batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"document_ids\": $(echo "$DOC_IDS" | jq -R -s -c 'split("\n") | map(select(length > 0))')}"
```

## Document Fields Reference

Key fields returned in document objects:

| Field | Description |
|-------|-------------|
| `id` | UUID |
| `title` | Meeting title |
| `created_at` / `updated_at` | Timestamps |
| `workspace_id` | Which workspace owns this doc |
| `notes_markdown` | Formatted notes |
| `notes_plain` | Plain text notes |
| `summary` | AI-generated summary |
| `overview` | Extended overview |
| `people.attendees[]` | Participant info |
| `google_calendar_event` | Calendar metadata |
| `visibility` | Sharing settings |
| `public` | Boolean |
| `sharing_link_visibility` | "public" or other |

## Limitations

- **No official API** - All endpoints are reverse-engineered and unsupported
- **Token expiration** - WorkOS tokens are short-lived
- **No write access** - Read-only; cannot create/modify meetings
- **Rate limits unknown** - Use conservatively
- **Format may change** - Any Granola update could break these endpoints

## References

- [reverse-engineering-granola-api](https://github.com/getprobo/reverse-engineering-granola-api) - Community API documentation
- [granola-export-tool](https://github.com/haasonsaas/granola-export-tool) - Python client with API support
