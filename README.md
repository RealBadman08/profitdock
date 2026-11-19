# Create Deriv V2

This template was generated using `create-deriv-v2`

## Getting started

To run the development server:

```bash
npm run dev
```

To generate a build:

```bash
npm run build
```

## Deploying to Cloudflare Pages

In order to generate a deployment to Cloudflare Pages, ensure that the following secrets are set in the Github Actions:

```bash
CLOUDFLARE_ACCOUNT_ID=****
CLOUDFLARE_API_TOKEN=****
CLOUDFLARE_PROJECT_NAME=****
```

## Generating a test link preview to Cloudflare Pages

In order to generate a test link deployment to Cloudflare Pages, ensure that the following secrets are set in the Github Actions:

```bash
CLOUDFLARE_ACCOUNT_ID=****
CLOUDFLARE_TEST_LINK_TOKEN=****
CLOUDFLARE_PROJECT_NAME=****
```

## Notifications to Slack

To allow notifications to be sent to Slack whenever a new staging build is triggered, ensure that the following secrets are set in the Github Actions:

```bash
SLACK_WEBHOOK=***
```

## AI Workflow: Authentication First

Any AI or coding agent working in this repository must inspect and verify the login flow before changing trading logic, shared UI, deployment configuration, or account/session behavior.

### Required first checks

1. Read the current authentication implementation before editing:
    - `src/components/shared/utils/config/config.ts`
    - `src/components/shared/utils/login/login.ts`
    - `src/components/layout/header/header.tsx`
    - `api/deriv/oauth/start.js`
    - `api/deriv/oauth/exchange.js`
    - `public/profitdock-auth-callback.html`
    - `src/external/bot-skeleton/services/api/profitdock-oauth-session.ts`
2. Preserve the host-specific OAuth mapping:
    - `profitdock.site` must use its own registered Deriv client and return to `https://profitdock.site/auth/callback`.
    - `profitdocker.site` must use its own registered Deriv client and return to `https://profitdocker.site/auth/callback`.
    - `www` hosts must resolve to the matching apex host and must not borrow the other domain's client, callback, or cookies.
3. Start login through the repository's `/api/deriv/oauth/start` route. Do not replace it with a hardcoded redirect to a Deriv homepage or a different production domain.
4. Preserve PKCE state and verifier handling, host-scoped cookies, callback code exchange, account hydration, and the existing demo-account requirement. Never place passwords, tokens, or private credentials in source code, logs, screenshots, or commits.

### Verification gate

Before considering any change complete, verify that:

- the build and relevant tests pass;
- `/api/deriv/oauth/start` returns a `302` to Deriv's authentication endpoint with the callback for the same domain;
- the callback route and token exchange use the same domain and OAuth client as the start route;
- the flow does not land on a Deriv error page caused by a mismatched `redirect_uri`;
- the live production domain is checked after deployment, not only a local build or preview;
- shared authentication changes are mirrored in both `DDBOt-master` and `profitdocker` when both projects are affected.

Do not modify or execute trading behavior until this authentication gate has passed. If authentication is unavailable or the domain/client mapping is uncertain, stop and report the blocker instead of adding a mock login, fake session, placeholder token, or simulated success state.
