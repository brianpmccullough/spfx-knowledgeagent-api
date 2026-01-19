# API Reference

This document provides detailed documentation for all API endpoints.

## Authentication

All endpoints require Azure AD Bearer token authentication unless otherwise noted.

Include the token in the Authorization header:

```
Authorization: Bearer <access_token>
```

The token must be obtained from Azure AD with the appropriate scopes for your app registration.

## Endpoints

### Chat

#### POST /api/chat

Submit a chat message and receive an AI-generated response.

**Authentication:** Required

**Request Body:**

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What documents do we have about project planning?"
    }
  ],
  "context": {
    "siteUrl": "https://contoso.sharepoint.com/sites/TeamSite",
    "searchMode": "rag"
  }
}
```

**Request Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | ChatMessage[] | Yes | Conversation history |
| `messages[].role` | string | Yes | `user`, `assistant`, or `system` |
| `messages[].content` | string | Yes | Message content |
| `context` | object | Yes | Request context |
| `context.siteUrl` | string | Yes | SharePoint site URL to search |
| `context.searchMode` | string | No | `rag` or `kql` (default from config) |

**Search Modes:**

| Mode | Description |
|------|-------------|
| `rag` | Vector semantic search over pre-indexed knowledge base |
| `kql` | SharePoint KQL keyword search with live document reading |

**Response:**

```json
{
  "response": "Based on the documents I found, here are the project planning resources...",
  "messages": [
    {
      "role": "user",
      "content": "What documents do we have about project planning?"
    },
    {
      "role": "assistant",
      "content": "Based on the documents I found, here are the project planning resources..."
    }
  ],
  "searchMode": "rag"
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `response` | string | The assistant's response (last message content) |
| `messages` | ChatMessage[] | Full conversation including the response |
| `searchMode` | string | Search mode that was used |

---

### User Profile

#### GET /api/me

Get the authenticated user's profile information from Microsoft Graph.

**Authentication:** Required

**Response:**

```json
{
  "displayName": "John Doe",
  "mail": "john.doe@contoso.com",
  "jobTitle": "Software Engineer",
  "department": "Engineering",
  "officeLocation": "Building A",
  "companyName": "Contoso",
  "manager": {
    "displayName": "Jane Smith",
    "mail": "jane.smith@contoso.com"
  }
}
```

---

### Knowledge Indexer Admin

These endpoints manage the background document indexing service.

#### POST /api/admin/knowledge-indexer/run

Trigger a full indexing run (search, extract, chunk, embed, store).

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `siteUrl` | string | No | All sites | Limit indexing to specific SharePoint site |
| `days` | number | No | 2 | Number of days back to search for modified documents |

**Example:**

```
POST /api/admin/knowledge-indexer/run?siteUrl=https://contoso.sharepoint.com/sites/TeamSite&days=7
```

**Response:**

```json
{
  "success": true,
  "documentsProcessed": 15,
  "chunksCreated": 127,
  "errors": []
}
```

---

#### GET /api/admin/knowledge-indexer/preview

Preview which documents would be indexed without actually processing them.

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `siteUrl` | string | No | All sites | Limit to specific SharePoint site |
| `days` | number | No | 2 | Number of days back to search |
| `limit` | number | No | 20 | Maximum results to return |

**Example:**

```
GET /api/admin/knowledge-indexer/preview?days=7&limit=10
```

**Response:**

```json
{
  "total": 45,
  "showing": 10,
  "options": {
    "siteUrl": "(all sites)",
    "modifiedWithinDays": 7
  },
  "documents": [
    {
      "name": "Project Plan.docx",
      "webUrl": "https://contoso.sharepoint.com/sites/TeamSite/Documents/Project Plan.docx",
      "lastModifiedDateTime": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

#### POST /api/admin/knowledge-indexer/test

Test the indexing pipeline without storing embeddings. Useful for verifying content extraction works correctly.

**Authentication:** Required

**Query Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `siteUrl` | string | No | All sites | Limit to specific SharePoint site |
| `days` | number | No | 2 | Number of days back to search |

**Example:**

```
POST /api/admin/knowledge-indexer/test?siteUrl=https://contoso.sharepoint.com/sites/TeamSite
```

**Response:**

```json
{
  "success": true,
  "documentsProcessed": 15,
  "chunksCreated": 127,
  "errors": [],
  "skippedEmbeddings": true
}
```

---

#### GET /api/admin/knowledge-indexer/stats

Get statistics about the vector search index.

**Authentication:** Required

**Response:**

```json
{
  "indexName": "knowledgeagent-chunks",
  "documentCount": 1250,
  "storageSize": "15.2 MB"
}
```

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "statusCode": 401,
  "message": "Unauthorized",
  "error": "Invalid or expired token"
}
```

**Common Status Codes:**

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid request body or parameters |
| 401 | Unauthorized - Missing or invalid authentication token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource does not exist |
| 500 | Internal Server Error - Server-side error |

---

## CORS

The API accepts requests from configured SharePoint Online domains:

- Origin pattern: `constoso.sharepoint.com`
- Credentials: Supported
