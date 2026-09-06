# Deployment guide

How to get this API running on a live url, end to end. The stack is Postgres on Neon and the app on Vercel, deployed as a single serverless function from the bundled `dist/server.js`. Everything below uses free tiers only.

## 0. What you need before starting

Accounts, all free, no card required for any of them:

- GitHub (code hosting, Vercel deploys from it)
- [Neon](https://neon.com) (managed Postgres)
- [Vercel](https://vercel.com) (hosting)
- [Stripe](https://dashboard.stripe.com) (test mode, no activation needed)
- [Google Cloud](https://console.cloud.google.com) (for social login)

Local tools: [Vercel CLI](https://vercel.com/docs/cli) (`bun i -g vercel` or `npm i -g vercel`), and the [Stripe CLI](https://github.com/stripe/stripe-cli#installation) if you want to test webhooks locally.

## 1. Push the code to GitHub

```bash
git remote add origin git@github.com:<you>/ambulance-dispatch-api.git
git push -u origin master
```

Never commit `.env`. It is already gitignored. The `.env.example` file documents every variable for whoever sets up the deployment.

## 2. Create the Neon database

1. Sign in at neon.com and create a project, any name works.
2. Open the project's **Dashboard** and find the connection details. Neon shows two connection strings:
   - **Pooled**, the hostname contains `-pooler`. This one goes into `DATABASE_URL`.
   - **Direct** (no `-pooler`). This one goes into `DIRECT_URL`.
3. Copy both strings. The password is embedded in them, keep the tab open.

Why two: the running app talks through the pooled string, so serverless invocations share a small pool of connections instead of exhausting Postgres on cold starts. Prisma needs a direct connection to run migrations. Nothing in the code changes, `schema.prisma` already wires both through `directUrl`.

## 3. Create the Stripe test keys

1. Go to dashboard.stripe.com and make sure the **Test mode** toggle is on.
2. Copy the **Secret key** (`sk_test_...`) from Developers, API keys. That is `STRIPE_SECRET_KEY`.
3. The webhook secret comes later, after the app is deployed and you know the final url. Leave `STRIPE_WEBHOOK_SECRET` as a placeholder for the first deploy.

Test mode moves no real money and needs no account activation, but the whole checkout and webhook flow is real.

## 4. Set up Google login

1. In Google Cloud Console, create a project (or reuse one).
2. APIs and Services, OAuth consent screen: choose External, fill in the app name and a support email, add yourself as a test user. Testing mode is fine, no verification process needed.
3. Credentials, Create credentials, OAuth client ID. Application type **Web application**. Web application origins and redirect uris are not needed for this flow, the backend only verifies id tokens that a frontend or the OAuth playground produces.
4. Copy the client id (`....apps.googleusercontent.com`). That is `GOOGLE_CLIENT_ID`.

## 5. Local production rehearsal

Do this once before deploying so the live deploy is boring:

```bash
bun run build        # runs prisma generate, then bundles to dist/
PORT=5050 node dist/server.js
```

Then hit `http://localhost:5050/api/v1/health` and log in with the demo admin. If the bundle boots locally against your local database, it will boot on Vercel.

## 6. Deploy to Vercel

```bash
vercel login
vercel link        # inside the project folder, create or pick a project
```

Add every environment variable from `.env.example` to the Vercel project. Either through the dashboard (Project, Settings, Environment Variables) or the cli:

```bash
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add JWT_ACCESS_SECRET
vercel env add JWT_REFRESH_SECRET
vercel env add JWT_ACCESS_EXPIRES_IN
vercel env add JWT_REFRESH_EXPIRES_IN
vercel env add GOOGLE_CLIENT_ID
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_CURRENCY
vercel env add APP_BASE_URL
vercel env add CORS_ORIGIN
```

Values for the first deploy:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** string (hostname has `-pooler`) |
| `DIRECT_URL` | Neon **direct** string |
| `JWT_ACCESS_SECRET` | Any long random string, at least 16 chars |
| `JWT_REFRESH_SECRET` | A different long random string |
| `JWT_ACCESS_EXPIRES_IN` | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | `7d` |
| `GOOGLE_CLIENT_ID` | The client id from step 4 |
| `STRIPE_SECRET_KEY` | The `sk_test_...` key from step 3 |
| `STRIPE_WEBHOOK_SECRET` | Placeholder for now, real value in step 9 |
| `STRIPE_CURRENCY` | `usd` |
| `APP_BASE_URL` | Placeholder for now, real value in step 7 |
| `CORS_ORIGIN` | Wherever a frontend would live, e.g. `http://localhost:3000` |

Generate good secrets with `openssl rand -hex 32`.

`vercel.json` already tells Vercel to serve `dist/server.js` as one serverless function for every route, and the `build` script runs `prisma generate && tsup` so the build works on Vercel's clean environment. Deploy:

```bash
vercel --prod
```

Note the url it prints, something like `https://<project>.vercel.app`. That is your live API.

## 7. Point the app at itself

Set `APP_BASE_URL` to the deployed url, without a trailing slash:

```bash
vercel env rm APP_BASE_URL
vercel env add APP_BASE_URL    # enter https://<project>.vercel.app
vercel --prod                  # redeploy to pick it up
```

This controls the Stripe checkout success and cancel callback urls, so it must be right before payments are tested.

## 8. Migrate and seed the production database

Run the migration against Neon from your machine using the direct url:

```bash
DATABASE_URL="<neon pooled string>" \
DIRECT_URL="<neon direct string>" \
bunx prisma migrate deploy
```

Then seed the demo admin, hospitals, and ambulances:

```bash
DATABASE_URL="<neon pooled string>" \
bun run db:seed
```

The seed is idempotent, running it twice changes nothing. Confirm the deployment works:

```bash
curl https://<project>.vercel.app/api/v1/health
curl -X POST https://<project>.vercel.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@dispatch.demo","password":"Admin123!"}'
```

## 9. Register the Stripe webhook

1. Stripe dashboard, Test mode, Developers, Webhooks, **Add endpoint**.
2. Endpoint url: `https://<project>.vercel.app/api/v1/payments/webhook`
3. Event: `checkout.session.completed`.
4. Create, then click **Reveal** on the signing secret (`whsec_...`).
5. Put it into Vercel and redeploy:

```bash
vercel env rm STRIPE_WEBHOOK_SECRET
vercel env add STRIPE_WEBHOOK_SECRET    # paste the whsec_... value
vercel --prod
```

A checkout is not finished until the webhook lands. If the payment stays PENDING after paying, check Vercel function logs for the webhook call.

### Testing webhooks locally instead

While developing, forward stripe events to your local server rather than deploying:

```bash
stripe listen --forward-to localhost:5000/api/v1/payments/webhook
# the cli prints a whsec_... value, put it in .env as STRIPE_WEBHOOK_SECRET, restart the server
stripe trigger checkout.session.completed
```

## 10. Google login on the deployed api

Nothing extra to configure server side. To try the flow without a frontend:

1. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Gear icon, check "Use your own OAuth credentials", paste your client id and secret. (The client secret only lives in the playground, the api itself never needs it.)
3. In step 1, add the scope `https://www.googleapis.com/auth/userinfo.email` and authorize.
4. Exchange the code for tokens, copy the **id_token**.
5. `POST https://<project>.vercel.app/api/v1/auth/google` with `{"idToken":"<paste>"}`. The api verifies it against your `GOOGLE_CLIENT_ID`, creates the account, and returns your own tokens.

## 11. Every deploy after this one

Push to the connected GitHub branch and Vercel rebuilds and redeploys automatically. Database changes ship like this:

1. Change `prisma/schema.prisma` locally
2. `bunx prisma migrate dev --name <change>` against your local database
3. Commit the generated migration folder and push
4. Apply to production: `DATABASE_URL=<pooled> DIRECT_URL=<direct> bunx prisma migrate deploy`
5. Vercel redeploys the new code whenever the branch is pushed

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `/api/v1/health` returns 500 | `DATABASE_URL` is missing or wrong on Vercel. Check the value is the pooled Neon string |
| 500 on every request, logs mention `directUrl` | `DIRECT_URL` missing or not the direct string |
| Login returns 401 for the demo admin | Seed did not run on production. Run it per step 8 |
| A variable works locally but fails deployed | It was never added to Vercel. Variables only exist where you put them |
| CORS errors from a browser app | Add the frontend origin to `CORS_ORIGIN` on Vercel, comma separated for several, then redeploy |
| Payment stays PENDING | Webhook not registered, wrong url, or `STRIPE_WEBHOOK_SECRET` still a placeholder. Stripe dashboard, Webhooks, check delivery attempts |
| Webhook returns 400 invalid signature | The `whsec_...` in Vercel does not belong to the endpoint you registered, or a proxy re-encoded the body. The webhook route reads the raw body, do not add body rewriting middleware in front of it |
| Rate limited in testing | Auth routes allow 30 requests per 15 minutes per ip. The limit is skipped when `NODE_ENV` is `test`, but a deployed api enforces it |
| Deployed function cold starts feel slow | Normal for serverless on a free plan, the first request after idle pays for the boot |

## Cost check

Neon free tier, Vercel hobby, Stripe test mode, Google OAuth in testing mode. Nothing here needs a card or a paid plan at any point.
