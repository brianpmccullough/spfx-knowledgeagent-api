# SPFx Knowledge Agent API

A NestJS-based backend API that powers SharePoint Online knowledge agent application. This service provides AI-powered chat capabilities, intelligent document search, document content extraction (Word/PDF/ASPX), user context, and semantic indexing.

## Features

- **AI-Powered Chat**: LangChain-orchestrated chat interface with Azure OpenAI GPT-4
- **Dual Search Modes**: RAG (vector semantic search) and KQL (keyword search) for SharePoint content
- **Document Processing**: Extracts content from PDFs, Word documents, and SharePoint pages
- **Enterprise Authentication**: Azure AD (Entra ID) token validation via Passport strategies
- **Microsoft Graph Integration**: Access to SharePoint sites, files, and user profiles
- **Knowledge Indexing**: Automated background indexing of SharePoint documents into vector database
- **Secure Semantic Search of Knowledge**: Ability to semantically query the vector database to augment user issued queries while still respecting source document permissions.

## Technology Stack

- **Framework**: NestJS 10 with TypeScript
- **AI/ML**: LangChain, Azure OpenAI (GPT-4, text-embedding-3-small)
- **Search**: Azure AI Search (vector + keyword)
- **Auth**: [Passport](https://docs.nestjs.com/recipes/passport) with Azure AD Bearer Strategy
- **Microsoft**: Microsoft Graph API, MSAL
- **Document Processing**: pdfjs-dist, mammoth

## Quick Start

### Prerequisites

- Node.js 18+
- Azure AD tenant with app registration
- Azure OpenAI resource
- Azure AI Search instance
- SharePoint Online tenant

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file in the project root with your configuration. See [docs/SETUP.md](docs/SETUP.md) for detailed configuration options.

### Running

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API will start on port 3000 (or the `PORT` environment variable).

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md) - System design and module interactions
- [Setup Guide](docs/SETUP.md) - Environment configuration and prerequisites
- [API Reference](docs/API.md) - Endpoint documentation with examples
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions

## Project Structure

```
src/
├── api/
│   ├── chat/              # Chat endpoint with LangChain agent and tools
│   ├── config/            # Configuration service
│   ├── knowledge-indexer/ # Document indexing pipeline
│   ├── me/                # User profile endpoint
│   └── shared-services/   # Microsoft Graph services
├── auth/                  # Azure AD authentication
├── app.module.ts          # Root module
└── main.ts                # Application entry point
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in development mode with hot reload |
| `npm run start:debug` | Start with debugger attached |
| `npm run build` | Build for production |
| `npm run start:prod` | Run production build |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run lint` | Lint and fix code |
| `npm run format` | Format code with Prettier |

## License

This project is provided as a sample/reference implementation.
