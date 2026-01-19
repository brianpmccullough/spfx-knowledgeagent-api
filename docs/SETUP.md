# Setup Guide

This guide walks through the prerequisites and configuration needed to run the SPFx Knowledge Agent API.

## Prerequisites

### Required Services

Before setting up the API, you need the following Azure resources:

1. **Azure AD (Entra ID) App Registration**
   - For authenticating users and API access

2. **Azure OpenAI Resource**
   - GPT-4 deployment for chat completions
   - text-embedding-3-small deployment for vector embeddings

3. **Azure AI Search Instance**
   - For storing and searching vector embeddings

4. **SharePoint Online Tenant**
   - Source of documents to index and search

### Development Tools

- Node.js 18 or higher
- npm (included with Node.js)
- Git

## Azure AD App Registration

### Create the App Registration

1. Navigate to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App registrations
2. Click **New registration**
3. Configure:
   - **Name**: SPFx Knowledge Agent API
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Leave blank (not needed for API)
4. Click **Register**

### Configure API Permissions

Add the following Microsoft Graph permissions:

| Permission | Type | Purpose |
|------------|------|---------|
| `User.Read` | Delegated | Read user profile |
| `Sites.Read.All` | Delegated | Read SharePoint sites (user context) |
| `Files.Read.All` | Delegated | Read SharePoint files (user context) |
| `Sites.Read.All` | Application | Read SharePoint sites (background indexing) |
| `Files.Read.All` | Application | Read SharePoint files (background indexing) |

After adding permissions, click **Grant admin consent** for your organization.

### Create a Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add a description and select expiration
4. Copy the secret value immediately (it won't be shown again)

### Expose an API

1. Go to **Expose an API**
2. Set the **Application ID URI** (e.g., `api://<client-id>`)
3. Add a scope:
   - **Scope name**: `access_as_user`
   - **Who can consent**: Admins and users
   - **Admin consent display name**: Access SPFx Knowledge Agent API
   - **Admin consent description**: Allow the application to access the Knowledge Agent API on behalf of the signed-in user

### Note Your Credentials

You'll need these values for configuration:

- **Directory (tenant) ID**
- **Application (client) ID**
- **Client secret** (from Certificates & secrets)
- **Tenant name** (e.g., `contoso` from `contoso.onmicrosoft.com`)

## Azure OpenAI Setup

### Create Azure OpenAI Resource

1. Navigate to [Azure Portal](https://portal.azure.com) > Create a resource > Azure OpenAI
2. Configure and create the resource

### Deploy Models

In Azure OpenAI Studio, deploy the following models:

| Model | Deployment Name (suggested) | Purpose |
|-------|----------------------------|---------|
| gpt-4o | `gpt-4o` | Chat completions |
| text-embedding-3-small | `text-embedding-3-small` | Vector embeddings |

### Note Your Credentials

- **Endpoint URL** (e.g., `https://<resource-name>.openai.azure.com/`)
- **API Key** (from Keys and Endpoint)
- **Deployment names** for both models
- **API Version** (e.g., `2024-05-01-preview`)

## Azure AI Search Setup

### Create Search Service

1. Navigate to [Azure Portal](https://portal.azure.com) > Create a resource > Azure AI Search
2. Select a pricing tier (Basic or higher recommended for vector search)
3. Create the resource

### Note Your Credentials

- **Endpoint URL** (e.g., `https://<service-name>.search.windows.net`)
- **Admin Key** (from Settings > Keys)
- **Index name** (choose a name, e.g., `knowledgeagent-chunks`)

The index will be created automatically on first run if it doesn't exist.

## Environment Configuration

Create a `.env` file in the project root with the following variables:

```bash
# Server
PORT=3000

# Azure AD Authentication (tenant where SPO lives)
AD_TENANT_NAME=your-tenant-name
AD_TENANT_ID=your-tenant-id
AD_CLIENT_ID=your-client-id
AD_CLIENT_SECRET=your-client-secret

# Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_OPENAI_API_VERSION=2024-05-01-preview

# Azure AI Search
AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net
AZURE_SEARCH_ADMIN_KEY=your-admin-key
AZURE_SEARCH_INDEX_NAME=knowledgeagent-chunks

# Knowledge Indexer Settings
KNOWLEDGE_INDEXER_ENABLED=true
KNOWLEDGE_INDEXER_INTERVAL_MS=3600000
SHAREPOINT_GEO=US
DEFAULT_SEARCH_MODE=kql
```

### Configuration Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `AD_TENANT_NAME` | Yes | - | Azure AD tenant name |
| `AD_TENANT_ID` | Yes | - | Azure AD tenant ID (GUID) |
| `AD_CLIENT_ID` | Yes | - | App registration client ID |
| `AD_CLIENT_SECRET` | Yes | - | App registration client secret |
| `AZURE_OPENAI_ENDPOINT` | Yes | - | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_API_KEY` | Yes | - | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | Yes | - | GPT model deployment name |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Yes | - | Embedding model deployment name |
| `AZURE_OPENAI_API_VERSION` | Yes | - | Azure OpenAI API version |
| `AZURE_SEARCH_ENDPOINT` | Yes | - | Azure AI Search endpoint |
| `AZURE_SEARCH_ADMIN_KEY` | Yes | - | Azure AI Search admin key |
| `AZURE_SEARCH_INDEX_NAME` | Yes | - | Name for the vector index |
| `KNOWLEDGE_INDEXER_ENABLED` | No | `true` | Enable/disable background indexing |
| `KNOWLEDGE_INDEXER_INTERVAL_MS` | No | `3600000` | Indexing interval (1 hour) |
| `SHAREPOINT_GEO` | No | `US` | SharePoint geography |
| `DEFAULT_SEARCH_MODE` | No | `kql` | Default search mode (`rag` or `kql`) |

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd spfx-knowledgeagent-api

# Install dependencies
npm install
```

## Running the API

### Development Mode

```bash
npm run start:dev
```

This starts the server with hot-reload enabled. Changes to source files will automatically restart the server.

### Debug Mode

```bash
npm run start:debug
```

This starts with the Node.js inspector enabled for debugging.

### Production Mode

```bash
npm run build
npm run start:prod
```

## Verifying the Setup

### Check Server Status

The server will log its URL on startup:

```
http://[::1]:3000
```

### Test the Me Endpoint

Make a request to `/api/me` with a valid Bearer token to verify authentication is working.

### Check Indexer Status

Use the admin endpoint to check indexer statistics:

```
GET /api/admin/knowledge-indexer/stats
```

## Troubleshooting

### Common Issues

**"Token validation failed"**
- Verify AD_TENANT_ID and AD_CLIENT_ID match your app registration
- Ensure the token audience matches your API's Application ID URI

**"Azure OpenAI request failed"**
- Check that deployment names match exactly
- Verify the API version is supported
- Ensure the API key is valid

**"Azure Search index not found"**
- The index is created on first indexing run
- Trigger a manual index run via the admin endpoint

**"CORS errors from SPFx"**
- Verify the request origin ends with `.sharepoint.com`
- Check that credentials are included in requests

### Logs

The API logs configuration values (excluding secrets) on startup. Check the console output to verify your configuration is loaded correctly.
