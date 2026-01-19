# Architecture Overview

This document describes the system architecture, module interactions, and data flow of the SPFx Knowledge Agent API.

## System Overview

The API serves as the backend intelligence layer for SharePoint Framework (SPFx) web parts, providing:

1. **Chat Interface** - AI-powered conversational access to organizational knowledge
2. **Knowledge Indexing** - Background processing of SharePoint documents into searchable vectors
3. **Search Capabilities** - Both semantic (RAG) and keyword (KQL) search modes

```
┌─────────────────────────────────────────────────────────────────┐
│                     SPFx Web Part (Client)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Bearer Token (Azure AD)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SPFx Knowledge Agent API                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────┐ │
│  │  AuthModule │  │  ChatModule │  │  KnowledgeIndexerModule  │ │
│  └─────────────┘  └─────────────┘  └──────────────────────────┘ │
│  ┌─────────────┐  ┌─────────────────────────────────────────────┘│
│  │   MeModule  │  │           SharedServicesModule              ││
│  └─────────────┘  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │   Azure AD   │    │ Azure OpenAI │    │  Azure AI    │
   │  (Entra ID)  │    │   (GPT-4)    │    │   Search     │
   └──────────────┘    └──────────────┘    └──────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Microsoft Graph │
                    │   (SharePoint)   │
                    └──────────────────┘
```

## Module Architecture

### AppModule (Root)

The root module that orchestrates all feature modules:

```typescript
AppModule
├── AuthModule           // Authentication strategies and guards
├── ChatModule           // Chat endpoint and LangChain agent
├── KnowledgeIndexerModule // Document indexing pipeline
├── MeModule             // User profile services
├── SharedServicesModule // Microsoft Graph clients
└── ConfigurationModule  // Environment configuration
```

### AuthModule

Handles Azure AD authentication using Passport.js.

**Components:**
- `AzureADStrategy` - Validates Bearer tokens against Azure AD JWKS endpoint
- `AzureADGuard` - Protects routes requiring authentication
- `@CurrentUser()` - Decorator to extract authenticated user from request

**Flow:**
```
Request → AzureADGuard → AzureADStrategy → Token Validation → User Context
```

### ChatModule

Provides the AI chat interface using LangChain.

**Components:**
- `ChatController` - REST endpoint (`POST /api/chat`)
- `ChatService` - LangChain agent orchestration with tools

**Available Tools:**
| Tool | Purpose |
|------|---------|
| `KnowledgeSearchTool` | Vector similarity search over indexed chunks |
| `GraphSearchTool` | KQL keyword search in SharePoint |
| `GraphFileReaderTool` | Extract full document content |
| `GraphSiteTool` | Retrieve SharePoint site information |
| `GraphMeTool` | Get current user profile |

**Search Modes:**
- **RAG** (Retrieval-Augmented Generation) - Uses vector embeddings for semantic search
- **KQL** (Keyword Query Language) - Uses SharePoint's native keyword search

### KnowledgeIndexerModule

Background service that indexes SharePoint documents into Azure AI Search.

**Pipeline:**
```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Search  │ →  │ Extract │ →  │  Chunk  │ →  │  Embed  │ →  │  Store  │
│Documents│    │ Content │    │  Text   │    │ Vectors │    │ Index   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

**Services:**
| Service | Responsibility |
|---------|----------------|
| `KnowledgeIndexerService` | Pipeline orchestration |
| `KnowledgeSchedulerService` | Scheduled background execution |
| `DocumentContentService` | PDF/Word/ASPX content extraction |
| `ChunkingService` | Text splitting with overlap |
| `EmbeddingService` | Azure OpenAI embedding generation |
| `VectorStoreService` | Azure AI Search integration |

**Admin Controller:**
- `POST /api/admin/knowledge-indexer/run` - Manual indexing trigger
- `GET /api/admin/knowledge-indexer/preview` - Preview search results
- `POST /api/admin/knowledge-indexer/test` - Test indexing without storage
- `GET /api/admin/knowledge-indexer/stats` - Index statistics

### SharedServicesModule

Provides Microsoft Graph API clients for all modules.

**Services:**
| Service | Auth Flow | Use Case |
|---------|-----------|----------|
| `OboGraphService` | On-Behalf-Of | User-delegated operations (chat, user queries) |
| `AppGraphService` | Client Credentials | Background operations (indexing) |

### MeModule

Simple module for retrieving the authenticated user's profile.

**Endpoint:** `GET /api/me`

**Returns:** User profile from Microsoft Graph (name, email, department, etc.)

## Data Flow

### Chat Request Flow

```
1. SPFx sends POST /api/chat with Bearer token and message
2. AzureADGuard validates token and extracts user context
3. ChatService creates LangChain agent with available tools
4. Agent determines which tools to call based on query
5. Tools query Azure AI Search (RAG) or SharePoint (KQL)
6. Results are synthesized by GPT-4 into response
7. Response streamed back to client
```

### Indexing Flow

```
1. Scheduler triggers indexing at configured interval
2. AppGraphService queries SharePoint for documents
3. DocumentContentService extracts text from files
4. ChunkingService splits text into overlapping chunks
5. EmbeddingService generates vector embeddings
6. VectorStoreService upserts chunks into Azure AI Search
```

## Authentication Flows

### On-Behalf-Of (OBO) Flow
Used for user-delegated operations where the API acts on behalf of the user.

```
SPFx → API (user token) → MSAL OBO → Graph API (OBO token)
```

### Client Credentials Flow
Used for background operations where no user context is needed.

```
Scheduler → MSAL Client Credentials → Graph API (app token)
```

## Vector Index Schema

Documents are stored in Azure AI Search with the following structure:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique chunk identifier |
| `content` | string | Text content of chunk |
| `contentVector` | vector | Embedding (1536 dimensions) |
| `metadata` | object | Source file info, URL, title |

## CORS Configuration

The API is configured to accept requests from specified SharePoint Online tenants:

```typescript
app.enableCors({
  origin: [constoso.sharepoint\.com$/],
  credentials: true,
});
```

## Environment Dependencies

| Service | Purpose |
|---------|---------|
| Azure AD (Entra ID) | Authentication and authorization |
| Azure OpenAI | LLM (GPT-4) and embeddings |
| Azure AI Search | Vector and keyword search |
| Microsoft Graph | SharePoint content access |
