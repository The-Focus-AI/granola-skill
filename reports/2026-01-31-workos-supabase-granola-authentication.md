---
title: "WorkOS Authentication: Integrating with Supabase and Understanding Granola's Implementation"
date: 2026-01-31
topic: workos-auth
recommendation: WorkOS User Management + AuthKit
version_researched: AuthKit 2025
use_when:
  - Building applications requiring enterprise SSO capabilities
  - Integrating third-party auth with Supabase databases
  - Need refresh token rotation for enhanced security
  - Reverse-engineering or integrating with Granola API
avoid_when:
  - Simple applications without enterprise authentication needs
  - Using Supabase Auth directly is sufficient
  - Budget constraints prevent WorkOS licensing
project_context:
  language: TypeScript/JavaScript, Python
  relevant_dependencies: "@supabase/supabase-js, @workos-inc/authkit-js"
---

## Summary

WorkOS is an enterprise-grade authentication platform that provides SSO, MFA, and user management capabilities[1]. Supabase added first-class WorkOS integration in 2025, allowing developers to use WorkOS as a third-party authentication provider while maintaining full access to Supabase's Data API, Storage, and Realtime features[2]. Granola, the popular AI meeting notes application, uses WorkOS for its authentication backend, implementing a strict refresh-token rotation pattern that has been reverse-engineered by the developer community[3].

The WorkOS-Supabase integration works by having Supabase trust JWTs issued by WorkOS, similar to how it trusts its own auth tokens[4]. This requires configuring a JWT template in WorkOS to map the `role` claim to "authenticated" (which Supabase expects) while preserving organizational role information in a separate claim[2]. Granola's implementation is notable for its strict single-use refresh token policy—each token can only be used once before rotation, providing strong replay attack protection but requiring careful token persistence[3].

Key metrics: WorkOS has raised $124M in funding, serves 500+ enterprise customers, and their AuthKit library is actively maintained on GitHub with regular updates[5]. The Supabase integration launched in early 2025 and has become a recommended approach for enterprise authentication scenarios[2].

## Philosophy & Mental Model

### WorkOS Authentication Model

WorkOS operates on the principle of **enterprise-first, developer-friendly** authentication. The core abstraction is the **User Management** system, which handles identity across multiple authentication methods (SSO, social login, email/password) with a unified API[1].

Key concepts:
- **Sessions**: WorkOS manages user sessions and issues short-lived access tokens (JWTs) paired with longer-lived refresh tokens
- **Organizations**: Users belong to organizations, and their JWT claims reflect their organizational role
- **JWT Templates**: Customizable token payloads that allow mapping WorkOS concepts to your application's expectations[6]

### Supabase Third-Party Auth

Supabase's third-party auth model treats external identity providers as **trusted issuers**[4]. When configured:

1. Your Supabase project validates JWTs from WorkOS's JWKS endpoint
2. The `role` claim in the JWT determines the Postgres role for database access
3. RLS policies can use `auth.jwt()` to access any JWT claim for authorization decisions[7]

### Granola's Token Architecture

Granola implements a **strict refresh-token rotation** pattern using WorkOS:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client App    │────▶│   WorkOS API    │────▶│   Granola API   │
│  (Desktop/Web)  │     │   /authenticate │     │   Bearer Token  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │  refresh_token_v1     │  access_token (1hr)  │
        │◀──────────────────────│                       │
        │                       │                       │
        │  refresh_token_v2     │  (token rotated)      │
        │◀──────────────────────│                       │
```

The mental model: treat refresh tokens as **single-use credentials** that are immediately invalidated after exchange[3].

## Setup

### WorkOS + Supabase Integration

#### Step 1: Configure WorkOS Dashboard

1. Navigate to **Authentication → Sessions → JWT Template**
2. Add the following template to map roles correctly for Supabase[2]:

```json
{
  "role": "authenticated",
  "user_role": "{{organization_membership.role}}"
}
```

3. Note your WorkOS Client ID (format: `client_...`)
4. Note your WorkOS issuer URL: `https://api.workos.com/user_management/<your-client-id>`

#### Step 2: Configure Supabase Dashboard

1. Navigate to **Authentication → Third-party Auth**
2. Add new integration with WorkOS issuer URL
3. Supabase will automatically fetch and trust WorkOS's JWKS

#### Step 3: Install Dependencies

```bash
npm install @supabase/supabase-js @workos-inc/authkit-js
```

#### Step 4: Environment Variables

```bash
# WorkOS Configuration
WORKOS_CLIENT_ID=client_...
WORKOS_API_KEY=sk_test_...
WORKOS_REDIRECT_URI=http://localhost:3000/callback
WORKOS_COOKIE_PASSWORD=$(openssl rand -base64 24)

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### Accessing Granola Tokens (for Integration)

Granola stores authentication tokens locally[8]:

**macOS**: `~/Library/Application Support/Granola/supabase.json`
**Windows**: `%APPDATA%\Granola\supabase.json`

Extract the token using bash/jq:

```bash
FILE="$HOME/Library/Application Support/Granola/supabase.json"
jq -r '
  (try (.workos_tokens | fromjson | .access_token) // empty) as $w |
  (try (.cognito_tokens | fromjson | .access_token) // empty) as $c |
  if ($w|length)>0 then $w else $c end
' "$FILE"
```

## Core Usage Patterns

### Pattern 1: Supabase Client with WorkOS Auth

Initialize a Supabase client that uses WorkOS access tokens[2]:

```typescript
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthKitClient } from '@workos-inc/authkit-js';

// Initialize WorkOS AuthKit
const authkit = await createAuthKitClient(
  process.env.WORKOS_CLIENT_ID!,
  {
    apiHostname: 'api.workos.com',
  }
);

// Initialize Supabase with WorkOS token provider
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    accessToken: async () => {
      return authkit.getAccessToken();
    },
  }
);

// Now use Supabase normally - RLS policies will use WorkOS JWT claims
const { data, error } = await supabase
  .from('documents')
  .select('*')
  .eq('user_id', (await authkit.getUser())?.id);
```

### Pattern 2: WorkOS Refresh Token Exchange

Exchange a refresh token for a new access token (Granola's pattern)[3]:

```typescript
interface TokenResponse {
  access_token: string;
  refresh_token: string;  // New rotated token - must persist!
  expires_in: number;     // 3600 seconds (1 hour)
  token_type: 'Bearer';
}

async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<TokenResponse> {
  const response = await fetch(
    'https://api.workos.com/user_management/authenticate',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }

  const data: TokenResponse = await response.json();

  // CRITICAL: Persist the new refresh_token immediately
  // The old token is now invalid
  await persistRefreshToken(data.refresh_token);

  return data;
}
```

### Pattern 3: Granola API Authenticated Request

Make authenticated requests to the Granola API[3][8]:

```typescript
interface GranolaDocument {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_viewed_panel?: object;
}

interface GetDocumentsResponse {
  docs: GranolaDocument[];
}

async function getGranolaDocuments(
  accessToken: string,
  limit = 100,
  offset = 0
): Promise<GetDocumentsResponse> {
  const response = await fetch('https://api.granola.ai/v2/get-documents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Granola/5.354.0',
      'X-Client-Version': '5.354.0',
    },
    body: JSON.stringify({
      limit,
      offset,
      include_last_viewed_panel: true,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token expired - refresh required');
    }
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}
```

### Pattern 4: RLS Policy with WorkOS Claims

Create Row Level Security policies using WorkOS JWT claims[7]:

```sql
-- Helper function to extract user ID from WorkOS JWT
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'sub';
$$ LANGUAGE SQL STABLE;

-- Helper function to get organizational role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS TEXT AS $$
  SELECT auth.jwt() ->> 'user_role';
$$ LANGUAGE SQL STABLE;

-- RLS policy: Users can only see their own documents
CREATE POLICY "Users can view own documents"
  ON documents
  FOR SELECT
  USING (user_id = current_user_id());

-- RLS policy: Admins can view all organization documents
CREATE POLICY "Admins can view all org documents"
  ON documents
  FOR SELECT
  USING (
    current_user_role() = 'admin'
    AND org_id = (auth.jwt() ->> 'org_id')
  );
```

### Pattern 5: Reading Granola Local Cache

Access Granola's local cache directly (no API calls needed)[9]:

```python
import json
import os
from pathlib import Path

def get_granola_cache():
    """Read Granola's local cache file directly."""
    cache_path = Path.home() / "Library/Application Support/Granola/cache-v3.json"

    with open(cache_path) as f:
        data = json.load(f)

    # Double-JSON parsing required
    cache_data = json.loads(data['cache'])
    state = cache_data['state']

    return {
        'documents': state.get('documents', {}),
        'meetings_metadata': state.get('meetingsMetadata', {}),
        'transcripts': state.get('transcripts', {}),
    }

# Usage
cache = get_granola_cache()
for doc_id, doc in cache['documents'].items():
    print(f"Meeting: {doc.get('title')} - {doc.get('created_at')}")
```

## Anti-Patterns & Pitfalls

### Don't: Reuse Refresh Tokens

```typescript
// BAD: Storing and reusing the same refresh token
class TokenManager {
  private refreshToken: string;

  async getAccessToken(): Promise<string> {
    const response = await refreshAccessToken(this.refreshToken);
    return response.access_token;
    // BUG: Not updating this.refreshToken with response.refresh_token
  }
}
```

**Why it's wrong:** WorkOS implements strict single-use refresh tokens. After one exchange, the old token is permanently invalidated. Attempting to reuse it will result in authentication failure[3].

### Instead: Always Persist Rotated Tokens

```typescript
// GOOD: Persisting new refresh token after each exchange
class TokenManager {
  private refreshToken: string;

  async getAccessToken(): Promise<string> {
    const response = await refreshAccessToken(this.refreshToken);

    // CRITICAL: Update stored token with rotated value
    this.refreshToken = response.refresh_token;
    await this.persistToken(this.refreshToken);

    return response.access_token;
  }
}
```

### Don't: Use user_metadata in RLS Policies

```sql
-- BAD: Using user_metadata for authorization
CREATE POLICY "Premium users only"
  ON premium_content
  FOR SELECT
  USING (auth.jwt() -> 'user_metadata' ->> 'plan' = 'premium');
```

**Why it's wrong:** The `user_metadata` claim can be modified by authenticated end users, creating a security vulnerability[7].

### Instead: Use Secure Claims from WorkOS

```sql
-- GOOD: Using organization membership role from WorkOS
CREATE POLICY "Premium users only"
  ON premium_content
  FOR SELECT
  USING (auth.jwt() ->> 'user_role' IN ('admin', 'premium'));
```

### Don't: Hardcode Role Claims for Supabase

```json
// BAD: In WorkOS JWT template - removing org role entirely
{
  "role": "authenticated"
}
```

**Why it's wrong:** You lose the ability to make authorization decisions based on organizational role[2].

### Instead: Preserve Role Information

```json
// GOOD: Map Supabase's expected role while preserving WorkOS role
{
  "role": "authenticated",
  "user_role": "{{organization_membership.role}}"
}
```

### Don't: Rely on get-documents for Shared Content

```typescript
// BAD: Expecting shared documents from this endpoint
const allDocs = await fetch('https://api.granola.ai/v2/get-documents', {
  // ...
});
// This will NOT include documents shared with you
```

**Why it's wrong:** The v2/get-documents endpoint only returns documents owned by the authenticated user, not shared documents[3].

### Instead: Use Batch Endpoint for Shared Documents

```typescript
// GOOD: Fetch document lists first, then batch-fetch including shared
const lists = await fetch('https://api.granola.ai/v2/get-document-lists', {...});
const docIds = extractDocumentIds(lists);

const allDocs = await fetch('https://api.granola.ai/v1/get-documents-batch', {
  body: JSON.stringify({ document_ids: docIds }),
  // ...
});
```

## Why This Choice

### Decision Criteria

| Criterion | Weight | How WorkOS + Supabase Scored |
|-----------|--------|------------------------------|
| Enterprise SSO support | High | Excellent - native SAML, OIDC support |
| Token security | High | Excellent - refresh token rotation, JWKS validation |
| Developer experience | Medium | Good - SDKs for major frameworks, clear documentation |
| Supabase compatibility | High | Excellent - first-party integration |
| Cost | Medium | Moderate - pricing scales with MAU |
| Community adoption | Medium | Good - growing, well-documented reverse-engineering |

### Key Factors

- **Enterprise authentication needs**: WorkOS provides SSO, directory sync, and MFA out of the box—critical for B2B applications that need to integrate with customer identity providers[1].

- **Supabase RLS compatibility**: The JWT template feature allows seamless mapping of WorkOS claims to Supabase's expected format, enabling full use of Row Level Security without custom middleware[2].

- **Token security model**: Refresh token rotation prevents replay attacks and provides auditability. While this requires more careful implementation, it significantly improves security posture[3].

## Alternatives Considered

### Supabase Auth (Native)

- **What it is:** Supabase's built-in authentication system with email/password, magic links, and OAuth providers
- **Why not chosen:** Lacks enterprise SSO features (SAML, SCIM) required for B2B sales
- **Choose this instead when:**
  - Building consumer applications without enterprise requirements
  - Budget constraints are primary concern
  - Simpler auth flow is preferred
- **Key tradeoff:** Lose enterprise features, gain simplicity and lower cost

### Auth0

- **What it is:** Established identity platform with comprehensive features
- **Why not chosen:** Higher complexity and cost; Supabase integration requires more custom work
- **Choose this instead when:**
  - Already using Auth0 across organization
  - Need advanced features like Adaptive MFA
  - Enterprise support contract required
- **Key tradeoff:** More features but higher complexity and cost

### Firebase Auth

- **What it is:** Google's authentication service
- **Why not chosen:** Poor Supabase integration; designed for Firebase ecosystem
- **Choose this instead when:**
  - Using Firebase/Google Cloud Platform extensively
  - Need tight Google Workspace integration
- **Key tradeoff:** Ecosystem lock-in vs Supabase flexibility

### Clerk

- **What it is:** Modern auth platform with excellent DX
- **Why not chosen:** Less mature enterprise features compared to WorkOS
- **Choose this instead when:**
  - Prioritizing developer experience over enterprise features
  - Building modern React/Next.js applications
  - Need pre-built UI components
- **Key tradeoff:** Better DX, fewer enterprise features

## Caveats & Limitations

- **Token expiration handling**: Access tokens expire in 1 hour. Applications must implement proper refresh logic or users will experience unexpected 401 errors. The Granola Raycast extension notes users may need to "re-sign in if your session has expired"[8].

- **Single-use refresh tokens**: Unlike some OAuth implementations that allow refresh token reuse within a window, WorkOS (and Granola) invalidate tokens immediately upon use. Failed token persistence leads to authentication lockout requiring full re-authentication[3].

- **Granola API undocumented**: The Granola API is not officially documented or supported. Endpoints may change without notice. The community has reverse-engineered the API, but this should be used with awareness of potential breaking changes[3].

- **Security advisory history**: A 2025 Tenable advisory (TRA-2025-07) identified an information disclosure vulnerability in Granola's unauthenticated endpoints. While patched, this highlights the importance of monitoring for security updates[10].

- **JWT template size limit**: WorkOS JWT templates must render to 3,072 bytes or less due to browser cookie constraints. Complex claim structures may need optimization[6].

- **RLS policy complexity**: Using WorkOS claims in Supabase RLS policies requires careful testing. The `auth.jwt()` function must be used correctly, and not all JWT claims should be trusted for authorization decisions[7].

## References

[1] [WorkOS User Management](https://workos.com/user-management) - Overview of WorkOS authentication capabilities and enterprise features

[2] [Supabase + AuthKit Integration](https://workos.com/docs/integrations/supabase-authkit) - Official WorkOS documentation for Supabase integration, JWT template configuration

[3] [Reverse Engineering Granola API](https://github.com/getprobo/reverse-engineering-granola-api) - Community-documented Granola API endpoints and authentication flow

[4] [Supabase Third-party Auth Overview](https://supabase.com/docs/guides/auth/third-party/overview) - Supabase documentation on third-party authentication providers

[5] [WorkOS Launch Week Summer 2025](https://workos.com/launch-week/summer-2025) - Recent feature announcements and company updates

[6] [WorkOS JWT Templates Documentation](https://workos.com/docs/user-management/jwt-templates) - Detailed JWT template syntax and customization options

[7] [Supabase Token Security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security) - Security best practices for third-party auth tokens and RLS policies

[8] [Granola Raycast Extension](https://www.raycast.com/Rob/granola) - Third-party integration showing token storage locations and access patterns

[9] [Granola MCP Integration Guide](https://cobblehilldigital.com/articles/how-to-build-a-custom-granola-claude-mcp-integration-for-ai-powered-meeting-intelligence) - Technical implementation of Granola local cache access

[10] [Tenable Security Advisory TRA-2025-07](https://www.tenable.com/security/research/tra-2025-07) - Granola API endpoint information disclosure vulnerability

[11] [Joseph Thacker's Reverse Engineering Guide](https://josephthacker.com/hacking/2025/05/08/reverse-engineering-granola-notes.html) - Original research on Granola API authentication flow

[12] [WorkOS Refresh Token Blog](https://workos.com/blog/why-your-app-needs-refresh-tokens-and-how-they-work) - Explanation of refresh token rotation security model

[13] [WorkOS + Supabase Blog Announcement](https://workos.com/blog/supabase-integration) - Official announcement of the WorkOS-Supabase partnership

[14] [Supabase WorkOS Documentation](https://supabase.com/docs/guides/auth/third-party/workos) - Supabase's official guide for WorkOS integration
