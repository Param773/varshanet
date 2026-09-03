require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const db = require("./db");
const { generateSeedReports } = require("./seedData");
const { runIngestion } = require("./ingest");

const reportsRouter = require("./routes/reports");
const adminRouter = require("./routes/admin");
const weatherRouter = require("./routes/weather");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/weather", weatherRouter);

// Serve the frontend
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Auto-seed demo history on first boot so the dashboard isn't empty.
// No-ops once data/reports.json already has rows in it.
const existing = db.getAllReports();
if (existing.length === 0) {
  const seeded = generateSeedReports(220);
  db.bulkSeed(seeded);
  console.log(`Seeded ${seeded.length} demo reports into data/reports.json`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VarshaNet server running on http://localhost:${PORT}`);
});

// Live public-API ingestion: pull real Open-Meteo readings for major
// Indian cities once at boot, then every 20 minutes.
runIngestion();
const INGEST_INTERVAL_MS = 20 * 60 * 1000;
setInterval(runIngestion, INGEST_INTERVAL_MS);