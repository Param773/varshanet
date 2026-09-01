const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const db = require("../db");
const { scoreReport, statusFromTrust } = require("../scoring");
const { fetchCityWeather } = require("../weather");
const { requireAdmin } = require("../middleware/auth");

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, "..", "..", "data", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

// GET /api/reports — full list, client filters/sorts it (same shape the
// original prototype held in memory, just persisted now).
router.get("/", (req, res) => {
  res.json(db.getAllReports());
});

// POST /api/reports — citizen submits a report. multipart/form-data:
//   category, description, city, state, lat?, lng?, media? (file)
router.post("/", upload.single("media"), async (req, res) => {
  try {
    const { category, description, city, state: stateName, lat, lng } = req.body || {};
    if (!category || !city) {
      return res.status(400).json({ error: "category and city are required" });
    }

    const file = req.file;
    let mediaHash = null;
    let mediaPath = null;
    let hasPhoto = false;
    let hasVideo = false;
    const hasMedia = !!file;

    if (file) {
      hasPhoto = file.mimetype.indexOf("image") === 0;
      hasVideo = file.mimetype.indexOf("video") === 0;
      mediaHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
      const ext = path.extname(file.originalname || "") || "";
      mediaPath = `${mediaHash}${ext}`;
      const fullPath = path.join(UPLOAD_DIR, mediaPath);
      // content-addressed filename: writing the same file twice is a no-op
      if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, file.buffer);
    }

    // Duplicate detection by actual file content, not just name/size.
    const existingWithHash = mediaHash ? db.findByMediaHash(mediaHash) : null;

    // Cross-check against live weather for the named city. If the lookup
    // fails (bad spelling, network hiccup) scoring just proceeds without it,
    // same fallback behaviour as the original prototype.
    let officialMain = null;
    let geoLat = lat !== undefined && lat !== "" ? parseFloat(lat) : null;
    let geoLng = lng !== undefined && lng !== "" ? parseFloat(lng) : null;
    try {
      const weather = await fetchCityWeather(city);
      officialMain = weather.main;
      if (geoLat === null) geoLat = weather.lat;
      if (geoLng === null) geoLng = weather.lng;
    } catch (e) {
      // no live weather available — that's fine, scoreReport tolerates null
    }
    if (geoLat === null || Number.isNaN(geoLat)) geoLat = 22.5 + (Math.random() - 0.5) * 16;
    if (geoLng === null || Number.isNaN(geoLng)) geoLng = 80 + (Math.random() - 0.5) * 16;

    const { trustScore, reasons } = scoreReport({
      description,
      event: category,
      hasMedia,
      mediaReused: !!existingWithHash,
      officialMain,
      city,
    });
    const status = statusFromTrust(trustScore);

    const report = db.addReport({
      city,
      state: stateName || "Unknown",
      lat: geoLat,
      lng: geoLng,
      event: category,
      source: "Citizen Report App",
      ts: Date.now(),
      trust: trustScore,
      status,
      hasPhoto,
      hasVideo,
      text: description || "(no description provided)",
      duplicateOf: existingWithHash ? existingWithHash.id : null,
      mediaHash,
      mediaPath,
    });

    res.json({ report, reasons });
  } catch (err) {
    console.error("Failed to submit report:", err);
    res.status(500).json({ error: "Failed to submit report. Please try again." });
  }
});

// PATCH /api/reports/:id/status — admin approves or rejects a queued report.
router.patch("/:id/status", requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!["verified", "rejected"].includes(status)) {
    return res.status(400).json({ error: 'status must be "verified" or "rejected"' });
  }
  const updated = db.updateReportStatus(id, status);
  if (!updated) return res.status(404).json({ error: "Report not found" });
  res.json(updated);
});

module.exports = router;
