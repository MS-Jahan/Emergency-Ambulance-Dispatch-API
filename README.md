# Emergency Ambulance Dispatch API

A REST API for requesting emergency ambulances and managing the whole trip: a patient calls for an ambulance, an admin dispatches the nearest available one, the driver moves the trip through its stages, and the patient pays for the ride online afterwards.

Three roles with strictly separated permissions:

- **PATIENT** creates emergency requests, tracks them, cancels, pays, and leaves feedback
- **DRIVER** goes online or offline, sees their assigned trips, and advances trip status
- **ADMIN** manages hospitals and ambulances, assigns ambulances to requests, manages users, and sees system wide stats and audit logs

## Features

- Email and password auth plus Google login, JWT access tokens (15 min) and rotating refresh tokens (7 days) with a database denylist so logout and reuse actually revoke access
- Role based access control enforced by middleware on every protected route
- Ambulance dispatch with race protection: the assign endpoint runs in a transaction with conditional updates, so the same ambulance can never be assigned to two trips at once. Losers get a 409
- One directional trip state machine (PENDING, ASSIGNED, EN_ROUTE_PICKUP, PICKED_UP, EN_ROUTE_HOSPITAL, COMPLETED, CANCELLED) validated server side
- Every status change writes an audit log row with the actor, from status, to status, and note, all in the same transaction as the change
- Nearby ambulance search with haversine distance from the ambulance's home hospital
- Stripe checkout payments with webhook handling, signature verification, success and cancel callbacks. A trip can only be paid after it is COMPLETED
- Trip feedback, one rating per completed trip per patient
- Soft deletes on users, hospitals, ambulances, and feedback, historical requests are never deleted
- Rate limiting on auth routes, helmet security headers, cors with explicit origins
- Structured envelope on every response: `{ success, message, data }` on success and `{ success, message, errors }` on failure

## Tech stack

Node.js 20+, TypeScript, Express 5, PostgreSQL, Prisma ORM, Zod, Stripe, pino, and Biome for linting and formatting. The bundled build uses tsup and deploys to Vercel as a single serverless function.

## Demo

Once running, the demo admin account is:

```
email:    admin@dispatch.demo
password: Admin123!
```

The seed also creates three hospitals and three ambulances. Create patient and driver accounts through the API to try those roles. Driver accounts are created by an admin through `POST /api/v1/admin/drivers`, or by promoting an existing user through `PATCH /api/v1/admin/users/:id/role`.

## API documentation

A complete Postman collection covering all 30 endpoints is in `docs/postman_collection.json`. Import it into Postman, set the `baseUrl` variable, and log in, the login request stores the token in the collection variable automatically.

## Getting started

Prerequisites: Node.js 20+, Bun, Docker (for the Postgres database).

```bash
# install dependencies
bun install

# start postgres
docker compose up -d db

# create your env file
cp .env.example .env
# then edit .env with your own secrets, database url, and stripe test keys

# create the schema and seed demo data
bunx prisma migrate dev
bun run db:seed

# run the api
bun run dev
```

The API listens on `http://localhost:5000`. Health check at `GET /api/v1/health`.

### Environment variables

See `.env.example` for the full list. The important ones:

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection string used by the running app. On Neon use the pooled string with `-pooler` in the hostname |
| `DIRECT_URL` | Direct connection used by Prisma for migrations. On Neon this is the non pooled string |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Random strings of at least 16 characters |
| `GOOGLE_CLIENT_ID` | OAuth client id for Google login |
| `STRIPE_SECRET_KEY` | Stripe test mode secret key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret of the `checkout.session.completed` webhook endpoint |
| `APP_BASE_URL` | Public base url of the API, used to build Stripe callback urls |
| `CORS_ORIGIN` | Comma separated list of allowed origins |

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Runs the API with auto reload |
| `bun run build` | Bundles the server with tsup into `dist/` |
| `bun run start` | Runs the built bundle |
| `bun run typecheck` | Type checks everything, no output |
| `bun run lint` | Lints and formats with Biome |
| `bun run db:migrate` | Creates and applies a migration in development |
| `bun run db:deploy` | Applies migrations, used in production |
| `bun run db:seed` | Seeds the demo admin, hospitals, and ambulances |
| `bun test` | Runs the integration test suite |

## Testing

The integration suite runs against a real Postgres database in `dispatch_test`:

```bash
# one time, create the test database and apply migrations
sudo docker exec dispatch-db psql -U dispatch -d dispatch -c "CREATE DATABASE dispatch_test;"
set -a; source .env.test; set +a; bunx prisma migrate deploy

# run the 61 tests
bunx vitest run
```

The suite covers registration and login, refresh rotation and logout revocation, role enforcement (a patient hitting an admin route gets 403), the full dispatch lifecycle from request creation through assignment to completion, the double assignment race, illegal status transitions, audit log entries on every change, soft deletes, Stripe webhook signature verification with locally signed events, payment gating on completed trips, and feedback rules.

## Trip payment flow

1. A trip reaches `COMPLETED` and the ambulance and driver go back to the available pool
2. The patient calls `POST /api/v1/payments/initiate`, which creates a Stripe checkout session and a PENDING payment row
3. The patient pays through the Stripe checkout url
4. Stripe calls `POST /api/v1/payments/webhook`, the signature is verified against the raw body, and the payment becomes PAID
5. The success and cancel callbacks give the browser a readable result and expire cancelled sessions

## Project structure

```
src/
  app.ts                 express app factory, middleware and route wiring
  server.ts              entrypoint, loads env and listens
  config/env.ts          zod validated environment variables
  lib/                   prisma client, stripe client, jwt helpers, logger
  middleware/            auth, rbac, validation, rate limiting, error handler
  modules/
    auth/                register, login, google, refresh, logout
    users/               profile get and patch
    hospitals/           hospital crud
    ambulances/          ambulance crud and nearby search
    drivers/             driver profile, status, location
    requests/            emergency request lifecycle and dispatch
    payments/            stripe checkout, webhook, callbacks
    feedback/            trip ratings
    admin/               staff creation, users, stats, audit logs
  routes/                health check
  shared/                response helpers, AppError, catchAsync, pagination
prisma/                  schema, migrations, seed
tests/                   vitest integration suites
```

## Deployment

The production build bundles `src/server.ts` into a single file with tsup and deploys to Vercel as one serverless function. Postgres lives on Neon, using the pooled connection string for the app and the direct one for migrations.

The full walkthrough is in [docs/deployment.md](docs/deployment.md), covering Neon and Stripe setup, every environment variable, migrations and seeding, registering the Stripe webhook, and troubleshooting.

Short version:

```bash
vercel login
vercel link
vercel env add DATABASE_URL      # neon pooled string
vercel env add DIRECT_URL        # neon direct string
# ... plus the rest of the variables from .env.example
vercel --prod
DATABASE_URL=<pooled> DIRECT_URL=<direct> bunx prisma migrate deploy
bun run db:seed                  # with DATABASE_URL pointing at neon
```

Then register `https://<your-app>.vercel.app/api/v1/payments/webhook` in the Stripe dashboard for the `checkout.session.completed` event and put its signing secret into `STRIPE_WEBHOOK_SECRET` on Vercel.
