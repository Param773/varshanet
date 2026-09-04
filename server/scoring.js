// Trust-scoring logic, ported 1:1 from the original front-end prototype so
// the scoring behaviour judges saw in the demo doesn't change — it just now
// runs server-side, against data nobody can tamper with from devtools.

const { classifyReportText } = require("./mlClassifier");

const CATEGORY_KEYWORDS = {
  rainfall: ["rain", "rainfall", "drizzle", "downpour", "showers", "pouring"],
  thunderstorm: ["thunder", "lightning", "storm", "gust", "squall"],
  flooding: ["flood", "waterlog", "submerged", "overflow", "inundat", "knee-deep"],
  heatwave: ["heat", "scorching", "hot", "heatwave", "sweltering"],
  fog: ["fog", "mist", "visibility", "haze"],
  dust_storm: ["dust", "sandstorm", "dust storm", "orange sky"],
  strong_winds: ["wind", "gust", "gale", "uprooted", "blown"],
};

const WEATHER_CONFLICTS = {
  rainfall: ["Clear"],
  flooding: ["Clear"],
  thunderstorm: ["Clear"],
  heatwave: ["Rain", "Snow", "Drizzle"],
  dust_storm: ["Rain"],
  fog: ["Clear"],
  strong_winds: [],
};

const SUSPICIOUS_WORDS = ["fake", "joke", "prank", "not real", "just kidding", "clickbait"];

function statusFromTrust(t) {
  if (t < 42) return "flagged";
  if (t < 68) return "pending";
  return "verified";
}

/**
 * @param {Object} o
 * @param {string} o.description
 * @param {string} o.event         - category key, e.g. "rainfall"
 * @param {boolean} o.hasMedia
  * @param {boolean} o.mediaReused  - true if this file's hash matches an existing report
 * @param {boolean} [o.mediaNearDuplicate] - true if this image closely resembles (but isn't byte-identical to) an existing report's media
 * @param {string|null} o.officialMain - live weather "main" condition for the city, or null
 * @param {string} o.city
 */
function scoreReport(o) {
  let score = 50;
  const reasons = [];
  const desc = (o.description || "").trim();
  const lower = desc.toLowerCase();
  SUSPICIOUS_WORDS.forEach((w) => {
    if (lower.indexOf(w) > -1) {
      score -= 40;
      reasons.push(`Contains suspicious phrase: "${w}"`);
    }
  });

  const mlResult = classifyReportText(desc);
  if (mlResult && mlResult.confidence > 0.65) {
    const pct = Math.round(mlResult.confidence * 100);
    if (mlResult.label === "suspicious") {
      score -= 20;
      reasons.push(`ML text classifier flagged this description as potentially misleading (${pct}% confidence)`);
    } else {
      score += 5;
      reasons.push(`ML text classifier assessed this description as consistent with genuine reports (${pct}% confidence)`);
    }
  }

  const keywords = CATEGORY_KEYWORDS[o.event] || [];
  const matched = keywords.some((k) => lower.indexOf(k) > -1);
  if (matched) {
    score += 15;
    reasons.push("Description text is consistent with reported category");
  } else if (desc.length > 0) {
    score -= 10;
    reasons.push("Description does not clearly match the reported category");
  }
  if (desc.length < 10) {
    score -= 5;
    reasons.push("Description is very short / low detail");
  }

  const exclaims = (desc.match(/!/g) || []).length;
  const capsRatio = (desc.match(/[A-Z]/g) || []).length / Math.max(1, desc.length);
  if (exclaims > 4 || capsRatio > 0.5) {
    score -= 10;
    reasons.push("Text style resembles spam (excessive caps/punctuation)");
  }

  score += 5;
  reasons.push("Direct citizen report (GPS/location captured at submission)");

  if (o.hasMedia) {
    score += 10;
    reasons.push("Report includes photo/video evidence");
  } else {
    score -= 5;
    reasons.push("No photo/video evidence attached");
  }

    if (o.mediaReused) {
    score -= 30;
    reasons.push("Identical media file (by content hash) already used in another report");
  } else if (o.mediaNearDuplicate) {
    score -= 15;
    reasons.push("Media closely resembles another submitted photo (possible re-upload or edited copy)");
  }

  if (o.officialMain) {
    const conflicts = WEATHER_CONFLICTS[o.event] || [];
    if (conflicts.indexOf(o.officialMain) > -1) {
      score -= 25;
      reasons.push(
        `Live weather data shows "${o.officialMain}" for ${o.city}, which conflicts with the reported category`
      );
    } else {
      score += 10;
      reasons.push(`Report is broadly consistent with live weather data for ${o.city}`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { trustScore: score, reasons };
}
function detectCategory(text) {
  const lower = (text || "").toLowerCase();
  if (!lower.trim()) return null;

  let bestKey = null;
  let bestCount = 0;
  Object.keys(CATEGORY_KEYWORDS).forEach((key) => {
    const count = CATEGORY_KEYWORDS[key].reduce(
      (acc, kw) => acc + (lower.indexOf(kw) > -1 ? 1 : 0),
      0
    );
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  });
  return bestKey;
}

module.exports = {
  scoreReport,
  statusFromTrust,
  detectCategory,
  CATEGORY_KEYWORDS,
  WEATHER_CONFLICTS,
  SUSPICIOUS_WORDS,
};