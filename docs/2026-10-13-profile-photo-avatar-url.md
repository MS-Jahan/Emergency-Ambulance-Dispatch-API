# Profile photo stored as a data URL

Date: 2026-10-13

## Decision
Photos are stored in the database, not in object storage. The client centre-crops
to 256x256 and re-encodes as JPEG (about 15-25 KB), then sends it as a base64
data URL in `PATCH /users/me` as `avatarUrl`. `null` removes it.

Why not Cloudinary/S3/Vercel Blob: no storage credentials exist for this project,
and Vercel functions have no persistent disk. A 256px photo is small enough for a
`TEXT` column.

## Changes
- `prisma/schema.prisma`: `User.avatarUrl String? @db.Text`.
- Migration `20261013120000_user_avatar`: `ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;`
  (additive, nullable; no data touched).
- `updateProfileSchema`: `avatarUrl` must match
  `data:image/(jpeg|png|webp);base64,...`, max 60,000 chars, or be `null`.
  SVG and other types are rejected (no script-bearing images).
- `avatarUrl` added to the public user select and `GET /users/me`.
- `tests/avatar-validation.test.ts`: accept/reject cases.

## Rollout order
1. Apply the migration (`bun run db:deploy`) against the target database.
2. Deploy the backend.
3. Deploy the frontend (it reads and writes `user.avatarUrl`).

If the frontend ships first, the field is stripped by validation and the UI shows
an error instead of claiming success.

## Limits
Every `/users/me` and auth response now carries up to ~60 KB extra for users
with a photo. Fine at this scale; move to object storage and a URL if it grows.
