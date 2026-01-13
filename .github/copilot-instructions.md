# Copilot Instructions — spfx-knowledgeagent-api

Purpose
- Provide guidance for Copilot assistance when editing this NestJS API project used by SPFx frontends that obtain EntraID (Azure AD) tokens via SPFx AADTokenProvider.
- Refer to project entry points: [`src/main.ts`](src/main.ts), controller/service/module implementations: [`AppController`](src/app.controller.ts) / [`src/app.controller.ts`](src/app.controller.ts), [`AppService`](src/app.service.ts) / [`src/app.service.ts`](src/app.service.ts), and [`AppModule`](src/app.module.ts) / [`src/app.module.ts`](src/app.module.ts).

Authentication (primary)
- Primary auth: Entra ID (Azure AD) access tokens issued to SPFx using AADTokenProvider.
- Expect requests to include header: `Authorization: Bearer <access_token>`.
- Validate tokens server-side:
  - Verify signature using Microsoft identity platform JWKS (cache keys).
  - Verify issuer (`iss`) and audience (`aud`) — use the API Application ID URI or app/client id configured for this API.
  - Verify scopes/roles (e.g., `api://<app-id>/user_impersonation`) depending on chosen permission design.
- Suggested libraries/approach:
  - Use a JWT validation strategy (Passport/Passport-JWT or custom) with JWKS fetching (e.g., `jwks-rsa`) or `@azure/identity`/`@azure/msal-node` as needed.
  - Cache JWKS and token validation results where appropriate to limit network calls.

Endpoints & Contracts
- All public API endpoints must:
  - Expect bearer tokens from SPFx AADTokenProvider.
  - Return JSON and standard HTTP status codes.
  - Declare required scopes in OpenAPI docs and in guard metadata.
- Keep controllers slim; business logic belongs in services (see [`AppController`](src/app.controller.ts) and [`AppService`](src/app.service.ts)).

NestJS-specific guidance
- Implement an AuthGuard (e.g., JwtAuthGuard) and apply globally or per-controller:
  - Example usage: add `@UseGuards(JwtAuthGuard)` on controllers or routes in [`src/app.controller.ts`](src/app.controller.ts).
- Register auth providers/strategies in [`AppModule`](src/app.module.ts) and keep configuration (issuer, audience, JWKS URI) injectable via environment variables.
- Configure CORS for SPFx origins in [`src/main.ts`](src/main.ts) when necessary.

Security & Operational
- Validate token expiry and scopes for authorization.
- Reject tokens not issued for this API (audience mismatch).
- Rate-limit public endpoints; add logging and structured error responses.
- Always sanitize inputs and avoid leaking stack traces in production responses.

Testing
- Unit tests: mock token validation and guard behavior; test controllers via Nest testing utilities (see existing unit test in [`src/app.controller.spec.ts`](src/app.controller.spec.ts)).
- E2E: use the existing e2e test setup ([`test/app.e2e-spec.ts`](test/app.e2e-spec.ts) and [`test/jest-e2e.json`](test/jest-e2e.json)). For auth-protected routes, stub or inject a validated token verification during tests.

Developer notes
- Config via env vars:
  - AAD_TENANT_ID, AAD_CLIENT_ID (API), AAD_JWKS_URI / or discover via `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`.
  - REQUIRED_SCOPE or REQUIRED_ROLE.
- Document expected SPFx usage in README and API docs showing how to call AADTokenProvider from SPFx and send Authorization header.
- Keep all API surface idempotent where appropriate; prefer versioned routes (e.g., `/api/v1/...`) for breaking changes.
- See project scripts and test commands in [`package.json`](package.json).

References
- SPFx AADTokenProvider: https://learn.microsoft.com/sharepoint/dev/spfx/use-aadtokenprovider
- Microsoft identity platform token validation: discover via tenant `.well-known/openid-configuration` and JWKS.

Quick pointers for Copilot completions
- Prefer adding NestJS Guards and injectable ConfigService usage.
- Use workspace symbols when modifying files: [`AppController`](src/app.controller.ts), [`AppService`](src/app.service.ts), [`AppModule`](src/app.module.ts).
- Run tests with `npm run test` and e2e with `npm run test:e2e` (see [`package.json`](package.json)).