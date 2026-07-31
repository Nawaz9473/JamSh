# JamSh Reels Deployment Guide

This guide details the pipeline requirements and steps to deploy the JamSh Reels feed system, HLS streaming, and FFmpeg transcode workers to production environments.

---

## 1. Prerequisites & Environment Parameters

Ensure the following variables are configured in your deployment keys (e.g., AWS Secrets Manager, GitHub Actions secrets, or Vercel config):

| Key | Scope | Description |
|---|---|---|
| `SUPABASE_URL` | Worker, API-Server | Production Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker | Secret key to write videos and update jobs bypass RLS |
| `DATABASE_URL` | Worker, API-Server | Secure transaction pool database link (Port 5432) |
| `JWT_SECRET` | API-Server | JWT sign/verify key |

---

## 2. Deploy Database Migrations

Deploy SQL updates using Supabase CLI:
```bash
# Verify connection
supabase status

# Push all migrations
supabase db push
```

---

## 3. Deploy Deno Edge Functions

Deploy the `reels-feed` endpoint:
```bash
supabase functions deploy reels-feed
```

---

## 4. Deploy Media transcode Worker (Docker)

The FFmpeg transcode worker is containerized. Build and publish to your registry (e.g., AWS ECR or Docker Hub):

```bash
# Build image
docker build -t jamsh/media-worker:latest ./apps/media-worker

# Push to registry
docker push jamsh/media-worker:latest
```

Set up rolling updates in Kubernetes/ECS with the default restart policies (`restart: on-failure`) to allow automatic worker recovery.

---

## 5. Rollback Playbook
If a bug is discovered post-release:
1. Revert Edge Functions:
   `supabase functions deploy reels-feed --version <previous_version_hash>`
2. Rollback migrations:
   Apply rollback script `20260725130000_rollback.sql` to revert Reels tables, triggers, and indices.
3. Redeploy previous Docker container tag:
   `docker pull jamsh/media-worker:<prev_stable_tag>`
