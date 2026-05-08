const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs/promises");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = path.join(__dirname, "data", "jobs.json");
const TARGET_COUNTRY = (process.env.TARGET_COUNTRY || "UAE").toUpperCase();
const TARGET_FIELD = (process.env.TARGET_FIELD || "medical").toLowerCase();
const TARGET_LOCATION = (process.env.TARGET_LOCATION || "UAE").toLowerCase();
const COLLECTION_INTERVAL_MS = Number(process.env.COLLECTION_INTERVAL_MS || 24 * 60 * 60 * 1000);

const sourceConfig = {
  adzuna: {
    enabled: Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY),
    appId: process.env.ADZUNA_APP_ID,
    appKey: process.env.ADZUNA_APP_KEY,
    countryCode: (process.env.ADZUNA_COUNTRY_CODE || "ae").toLowerCase(),
  },
};

async function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify({ jobs: [], metadata: {} }, null, 2));
  }
}

async function readStore() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

async function writeStore(data) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function stableId(input) {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "");
}

function normalizeAdzunaJob(job) {
  const city = job.location?.area?.slice(-1)?.[0] || "Unknown";
  const title = job.title || "Unknown title";
  const employer = job.company?.display_name || "Unknown employer";
  const applyUrl = job.redirect_url || "";

  return {
    id: stableId(`adzuna|${title}|${employer}|${city}|${applyUrl}`),
    source: "adzuna",
    source_job_id: String(job.id),
    title,
    employer,
    location_country: TARGET_COUNTRY,
    location_city: city,
    specialty: TARGET_FIELD,
    employment_type: "Unknown",
    experience_level: "Unknown",
    salary_min: job.salary_min || null,
    salary_max: job.salary_max || null,
    currency: "AED",
    description: job.description || "",
    requirements: [],
    apply_url: applyUrl,
    posted_at: job.created || null,
    collected_at: new Date().toISOString(),
    is_active: true,
  };
}

async function fetchFromAdzuna() {
  if (!sourceConfig.adzuna.enabled) {
    return [];
  }

  const url = `https://api.adzuna.com/v1/api/jobs/${sourceConfig.adzuna.countryCode}/search/1`;
  const response = await axios.get(url, {
    params: {
      app_id: sourceConfig.adzuna.appId,
      app_key: sourceConfig.adzuna.appKey,
      what: TARGET_FIELD,
      where: TARGET_LOCATION,
      results_per_page: 50,
      content_type: "application/json",
    },
    timeout: 25000,
  });

  const jobs = response.data?.results || [];
  return jobs.map(normalizeAdzunaJob);
}

function fallbackSeedJobs() {
  const now = new Date().toISOString();
  return [
    {
      id: stableId("seed|registered nurse|dubai hospital|dubai"),
      source: "seed",
      source_job_id: "seed-1",
      title: "Registered Nurse - ICU",
      employer: "Dubai Hospital",
      location_country: "UAE",
      location_city: "Dubai",
      specialty: "medical",
      employment_type: "Full-time",
      experience_level: "Mid",
      salary_min: null,
      salary_max: null,
      currency: "AED",
      description: "Demo listing used when external source credentials are not configured.",
      requirements: ["Valid DHA/DOH/MOH eligibility"],
      apply_url: "https://example.org/apply/rn-icu",
      posted_at: now,
      collected_at: now,
      is_active: true,
    },
  ];
}

function dedupeJobs(jobs) {
  const byId = new Map();
  for (const job of jobs) {
    byId.set(job.id, job);
  }
  return Array.from(byId.values());
}

async function collectJobs() {
  const startedAt = new Date().toISOString();
  const collected = [];

  try {
    const adzunaJobs = await fetchFromAdzuna();
    collected.push(...adzunaJobs);
  } catch (error) {
    console.error("Adzuna collection failed:", error.message);
  }

  if (collected.length === 0) {
    collected.push(...fallbackSeedJobs());
  }

  const deduped = dedupeJobs(collected);
  const store = {
    jobs: deduped,
    metadata: {
      last_collected_at: new Date().toISOString(),
      started_at: startedAt,
      total_jobs: deduped.length,
      sources_used: sourceConfig.adzuna.enabled ? ["adzuna"] : ["seed"],
      target_country: TARGET_COUNTRY,
      target_field: TARGET_FIELD,
      target_location: TARGET_LOCATION,
    },
  };

  await writeStore(store);
  return store;
}

app.get("/health", async (_req, res) => {
  const store = await readStore();
  res.json({
    status: "ok",
    last_collected_at: store.metadata?.last_collected_at || null,
    total_jobs: store.jobs?.length || 0,
  });
});

app.get("/jobs", async (req, res) => {
  const { city, specialty, q } = req.query;
  const store = await readStore();

  const filtered = store.jobs.filter((job) => {
    const cityMatch = city ? job.location_city.toLowerCase().includes(String(city).toLowerCase()) : true;
    const specialtyMatch = specialty ? job.specialty.toLowerCase().includes(String(specialty).toLowerCase()) : true;
    const keywordMatch = q
      ? `${job.title} ${job.employer} ${job.description}`.toLowerCase().includes(String(q).toLowerCase())
      : true;

    return cityMatch && specialtyMatch && keywordMatch;
  });

  res.json({ metadata: store.metadata, total: filtered.length, jobs: filtered });
});

app.post("/collect", async (_req, res) => {
  const result = await collectJobs();
  res.json({ ok: true, metadata: result.metadata, total: result.jobs.length });
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await collectJobs();
  setInterval(() => {
    collectJobs().catch((err) => console.error("Scheduled collection failed:", err.message));
  }, COLLECTION_INTERVAL_MS);
});
