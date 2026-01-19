# Deployment Guide

This guide covers deploying the SPFx Knowledge Agent API to production environments.

## Build for Production

```bash
# Install dependencies
npm ci

# Build the application
npm run build
```

This creates a `dist/` directory with the compiled JavaScript code.

## Environment Variables

For production, configure environment variables through your hosting platform's secrets management rather than a `.env` file.

**Required Variables:**

```
AD_TENANT_NAME
AD_TENANT_ID
AD_CLIENT_ID
AD_CLIENT_SECRET
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_EMBEDDING_DEPLOYMENT
AZURE_OPENAI_API_VERSION
AZURE_SEARCH_ENDPOINT
AZURE_SEARCH_ADMIN_KEY
AZURE_SEARCH_INDEX_NAME
```

**Optional Variables:**

```
PORT=3000
KNOWLEDGE_INDEXER_ENABLED=true
KNOWLEDGE_INDEXER_INTERVAL_MS=3600000
SHAREPOINT_GEO=US
DEFAULT_SEARCH_MODE=kql
```

See [SETUP.md](SETUP.md) for detailed variable descriptions.

## Deployment Options

### Azure App Service

Azure App Service is the recommended option for this Azure-native application.

#### 1. Create App Service

```bash
# Create resource group
az group create --name rg-knowledgeagent --location eastus

# Create App Service plan
az appservice plan create \
  --name asp-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --sku B1 \
  --is-linux

# Create web app
az webapp create \
  --name app-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --plan asp-knowledgeagent \
  --runtime "NODE:18-lts"
```

#### 2. Configure App Settings

```bash
az webapp config appsettings set \
  --name app-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --settings \
    AD_TENANT_NAME="your-tenant" \
    AD_TENANT_ID="your-tenant-id" \
    AD_CLIENT_ID="your-client-id" \
    AZURE_OPENAI_ENDPOINT="https://your-openai.openai.azure.com/" \
    AZURE_OPENAI_DEPLOYMENT="gpt-4o" \
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT="text-embedding-3-small" \
    AZURE_OPENAI_API_VERSION="2024-05-01-preview" \
    AZURE_SEARCH_ENDPOINT="https://your-search.search.windows.net" \
    AZURE_SEARCH_INDEX_NAME="knowledgeagent-chunks"
```

For secrets, use Key Vault references or configure directly:

```bash
az webapp config appsettings set \
  --name app-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --settings \
    AD_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/ad-client-secret)" \
    AZURE_OPENAI_API_KEY="@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/openai-api-key)" \
    AZURE_SEARCH_ADMIN_KEY="@Microsoft.KeyVault(SecretUri=https://your-vault.vault.azure.net/secrets/search-admin-key)"
```

#### 3. Deploy

**Option A: ZIP Deploy**

```bash
# Build and create deployment package
npm run build
zip -r deploy.zip dist package.json package-lock.json

# Deploy
az webapp deployment source config-zip \
  --name app-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --src deploy.zip
```

**Option B: GitHub Actions**

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install and build
        run: |
          npm ci
          npm run build

      - name: Deploy to Azure
        uses: azure/webapps-deploy@v2
        with:
          app-name: app-knowledgeagent
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: .
```

### Docker

#### Dockerfile

Create a `Dockerfile` in the project root:

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
```

#### Build and Run

```bash
# Build image
docker build -t knowledgeagent-api .

# Run container
docker run -d \
  -p 3000:3000 \
  -e AD_TENANT_NAME=your-tenant \
  -e AD_TENANT_ID=your-tenant-id \
  -e AD_CLIENT_ID=your-client-id \
  -e AD_CLIENT_SECRET=your-secret \
  -e AZURE_OPENAI_ENDPOINT=https://your-openai.openai.azure.com/ \
  -e AZURE_OPENAI_API_KEY=your-api-key \
  -e AZURE_OPENAI_DEPLOYMENT=gpt-4o \
  -e AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small \
  -e AZURE_OPENAI_API_VERSION=2024-05-01-preview \
  -e AZURE_SEARCH_ENDPOINT=https://your-search.search.windows.net \
  -e AZURE_SEARCH_ADMIN_KEY=your-admin-key \
  -e AZURE_SEARCH_INDEX_NAME=knowledgeagent-chunks \
  knowledgeagent-api
```

#### Azure Container Apps

```bash
# Create Container Apps environment
az containerapp env create \
  --name cae-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --location eastus

# Deploy container
az containerapp create \
  --name ca-knowledgeagent \
  --resource-group rg-knowledgeagent \
  --environment cae-knowledgeagent \
  --image your-registry.azurecr.io/knowledgeagent-api:latest \
  --target-port 3000 \
  --ingress external \
  --env-vars "AD_TENANT_NAME=your-tenant" "AD_TENANT_ID=your-tenant-id" ...
```

## Production Checklist

### Security

- [ ] Store secrets in Azure Key Vault or equivalent
- [ ] Enable HTTPS only
- [ ] Configure firewall rules to restrict access
- [ ] Review and minimize API permissions
- [ ] Enable audit logging
- [ ] Rotate client secrets regularly

### Performance

- [ ] Use appropriate App Service tier (B1 minimum, S1 recommended)
- [ ] Enable auto-scaling based on CPU/memory
- [ ] Configure appropriate indexer interval for your content volume
- [ ] Monitor Azure OpenAI token usage and quotas

### Monitoring

- [ ] Enable Application Insights
- [ ] Configure alerts for errors and latency
- [ ] Monitor Azure AI Search index size
- [ ] Track Azure OpenAI usage and costs

### Network

- [ ] Configure custom domain with SSL certificate
- [ ] Update CORS if deploying to non-SharePoint clients
- [ ] Consider VNet integration for private connectivity

## Scaling Considerations

### Horizontal Scaling

The API is stateless and supports horizontal scaling. When running multiple instances:

- The background indexer should run on only one instance to avoid duplicate processing
- Consider using Azure Service Bus or similar for coordinating indexer runs
- Use a shared vector index (Azure AI Search handles concurrent access)

### Indexer Tuning

Adjust indexer settings based on content volume:

| Content Volume | Recommended Interval |
|----------------|---------------------|
| < 100 docs/day | 3600000 (1 hour) |
| 100-1000 docs/day | 1800000 (30 min) |
| > 1000 docs/day | Consider event-driven indexing |

## Troubleshooting

### Application Logs

```bash
# Azure App Service
az webapp log tail --name app-knowledgeagent --resource-group rg-knowledgeagent
```

### Common Issues

**"CORS error in browser"**
- Verify the deployed URL serves the app
- Check that request origin matches `*.sharepoint.com` pattern

**"Authentication failures"**
- Verify AD_TENANT_ID and AD_CLIENT_ID match app registration
- Ensure client secret hasn't expired
- Check API permissions are granted admin consent

**"Azure OpenAI errors"**
- Verify deployment names exactly match
- Check quota hasn't been exceeded
- Ensure API version is supported

**"Indexer not running"**
- Check KNOWLEDGE_INDEXER_ENABLED is true
- Verify App-only permissions for Microsoft Graph
- Check App Service always-on setting is enabled

## Health Checks

Consider adding a health check endpoint for load balancer monitoring:

```
GET /health -> 200 OK
```

This can be implemented by adding a simple controller that returns service status.
