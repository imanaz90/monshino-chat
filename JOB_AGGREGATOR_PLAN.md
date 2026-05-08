# Job Vacancy Aggregator (Medical Jobs in UAE) - Build Plan

## Goal
Build an app that automatically collects available medical job vacancies in the UAE every day and produces a clean, detailed list.

## 1) Product scope (MVP)
- Collect vacancies once per day from approved sources.
- Normalize fields into one schema.
- De-duplicate repeated jobs.
- Save history so you can track new/removed postings.
- Provide filters (city, specialty, job type, employer, salary band, posting date).
- Export daily report (CSV + JSON + optional email digest).

## 2) Data model (normalized)
Use a single structure regardless of source:

```json
{
  "id": "stable_hash",
  "source": "bayt|linkedin|indeed|hospital_site",
  "source_job_id": "optional",
  "title": "Registered Nurse - ICU",
  "employer": "Cleveland Clinic Abu Dhabi",
  "location_country": "UAE",
  "location_city": "Abu Dhabi",
  "specialty": "Nursing",
  "employment_type": "Full-time",
  "experience_level": "Mid",
  "salary_min": null,
  "salary_max": null,
  "currency": "AED",
  "description": "...",
  "requirements": ["DHA/DOH/MOH license", "BLS"],
  "apply_url": "https://...",
  "posted_at": "2026-05-08T00:00:00Z",
  "collected_at": "2026-05-08T02:00:00Z",
  "is_active": true
}
```

## 3) Source strategy (important)
- Prefer official APIs or partner feeds first.
- For websites, check Terms of Service and robots.txt before scraping.
- Build one connector per source:
  - `fetch()` raw listings
  - `parse()` into normalized schema
  - `validate()` required fields

## 4) System architecture
- **Scheduler**: daily run (cron or cloud scheduler).
- **Collector workers**: run connector jobs in parallel with retry/backoff.
- **Normalizer**: map fields to canonical schema.
- **Deduper**: hash by `(title + employer + city + apply_url)`.
- **Storage**:
  - PostgreSQL for core data
  - Optional Redis for queue/cache
- **API/UI**:
  - REST API for search/filter
  - Simple dashboard for daily list
- **Reporter**:
  - CSV export
  - Email/Slack summary

## 5) Suggested tech stack
- Backend: Node.js + TypeScript + Express/NestJS
- Crawling: Playwright (dynamic pages), Axios + Cheerio (static pages)
- Queue: BullMQ
- DB: PostgreSQL + Prisma
- Scheduling: GitHub Actions cron / AWS EventBridge / Render cron
- Observability: Sentry + structured logs

## 6) Daily workflow
1. At 02:00 UTC, scheduler triggers collection.
2. Connectors fetch fresh job posts.
3. Records are normalized + validated.
4. Duplicates are merged.
5. Missing jobs from last N days are marked inactive.
6. Generate:
   - `jobs_YYYY-MM-DD.csv`
   - `jobs_YYYY-MM-DD.json`
   - summary: counts by city/specialty/new jobs

## 7) Compliance + quality
- Respect local laws, source ToS, and platform policies.
- Keep request rate limits conservative.
- Store source URL and collection timestamp for traceability.
- Add QA checks:
  - title/employer/apply_url non-empty
  - UAE location validation
  - description language cleanup

## 8) Minimal API design
- `GET /jobs?country=UAE&field=medical&city=Dubai&specialty=nursing&page=1`
- `GET /jobs/:id`
- `GET /reports/daily/:date`

## 9) 10-day implementation plan
- Day 1-2: schema + DB + API skeleton
- Day 3-4: 2 connectors + normalization + dedupe
- Day 5: scheduler + daily exports
- Day 6: dashboard list + filters
- Day 7: monitoring + retries + alerts
- Day 8: add 2-3 more connectors
- Day 9: QA and data quality rules
- Day 10: deploy + runbook

## 10) Example report output
- Total active medical jobs in UAE: 1,248
- New today: 103
- Top cities: Dubai (41%), Abu Dhabi (35%), Sharjah (14%)
- Top specialties: Nursing, General Practitioner, Radiology, Lab Tech

## 11) Next step (practical)
Start with one city (Dubai) and two reliable sources, prove daily stability for 7 days, then scale to all Emirates and additional sources.
