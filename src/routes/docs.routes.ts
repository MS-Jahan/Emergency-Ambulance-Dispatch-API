import { Router } from 'express'
import { readOpenApiSpec } from '../lib/openapi'
import { catchAsync } from '../shared/catchAsync'

export const docsRouter = Router()

docsRouter.get(
  '/openapi.yaml',
  catchAsync(async (_req, res) => {
    res.type('application/yaml').send(readOpenApiSpec())
  }),
)

docsRouter.get('/docs', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Emergency Ambulance Dispatch API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/v1/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`)
})
