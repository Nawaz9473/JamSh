# Production Checklist: JamSh Reels Security & Performance

This checklist compiles critical verification checkpoints to complete before shipping the Reels feed system to production.

---

## 1. Security & Row Level Security (RLS)
- [ ] **Verify RLS Enablement**:
  Run this query to check that all tables have RLS enabled:
  ```sql
  select tablename, rowsecurity from pg_tables 
  where schemaname = 'public' and tablename in ('videos', 'video_likes', 'video_comments', 'media_jobs');
  ```
- [ ] **Test Token Forgery**:
  Ensure user-facing update/delete operations check ownership using `(select auth.uid()) = user_id`.
- [ ] **Prevent Spam Likes/Saves**:
  Verify unique constraints exist on `(user_id, video_id)` in tables `video_likes` and `video_saves`.

---

## 2. API Rate Limiting & Protection
- [ ] **Rate Limit Uploads**:
  Configure Kong/Supabase API Gateway limits:
  * Maximum 3 uploads per hour per user.
- [ ] **Rate Limit Feed Queries**:
  * Maximum 30 feed queries per minute per IP.

---

## 3. Database Performance Tuning
- [ ] **Index Scan Verification**:
  Run `EXPLAIN ANALYZE` on recommendation scoring queries to confirm they hit index scans instead of sequential table scans.
- [ ] **Cache Prepopulation**:
  Ensure NestJS `ReelsCronService` runs in the background to compile caches and creators analytics hourly.

---

## 4. Monitoring & Observability
- [ ] **Structured Log Auditing**:
  Ensure media processing failures are logged with full stack traces in `media_jobs.error_log`.
- [ ] **Latency Alerts**:
  Configure alarms on Grafana/Supabase Studio for:
  * Feed endpoint latency > 150ms.
  * Media Worker Queue size > 25 pending jobs.
