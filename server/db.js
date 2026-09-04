// Lightweight file-based data store.
//
// VarshaNet's report volume for a hackathon deployment is modest (hundreds to
// low thousands of rows), so a single JSON file is enough and it means the
// project has zero native dependencies to compile during deploy. Swap this
// module out for Postgres/Mongo later if you need real concurrent-write
// safety at scale — every other file only talks to the functions exported
// here, so that's the only file you'd need to change.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_FILE)) {
    fs.writeFileSync(REPORTS_FILE, JSON.stringify({ nextId: 0, reports: [] }, null, 2));
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(REPORTS_FILE, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Corrupt or empty file — reset rather than crash the server.
    const fresh = { nextId: 0, reports: [] };
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

function writeData(data) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2));
}

function getAllReports() {
  return readData().reports;
}

function addReport(reportWithoutId) {
  const data = readData();
  const id = data.nextId++;
  const report = { id, ...reportWithoutId };
  data.reports.push(report);
  writeData(data);
  return report;
}

function updateReportStatus(id, status) {
  const data = readData();
  const report = data.reports.find((r) => r.id === id);
  if (!report) return null;
  report.status = status;
  if (status === "verified") report.duplicateOf = null;
  writeData(data);
  return report;
}

function findByMediaHash(hash) {
  if (!hash) return null;
  const data = readData();
  return data.reports.find((r) => r.mediaHash === hash) || null;
}

function findNearDuplicateByPerceptualHash(hash, maxDistance) {
  if (!hash) return null;
  const { hammingDistance } = require("./perceptualHash");
  const data = readData();
  let best = null;
  let bestDist = Infinity;
  data.reports.forEach((r) => {
    if (!r.perceptualHash) return;
    const dist = hammingDistance(hash, r.perceptualHash);
    if (dist <= maxDistance && dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  });
  return best;
}

// Only seeds if the store is currently empty — safe to call on every boot.
function bulkSeed(reports) {
  const data = readData();
  if (data.reports.length > 0) return false;
  let nextId = 0;
  data.reports = reports.map((r) => ({ id: nextId++, ...r }));
  data.nextId = nextId;
  writeData(data);
  return true;
}

module.exports = {
  getAllReports,
  addReport,
  updateReportStatus,
  findByMediaHash,
  findNearDuplicateByPerceptualHash,
  bulkSeed,
};
