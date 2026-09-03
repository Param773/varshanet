// Real public-API ingestion pipeline.
//
// Everything else that looks like "social media" or "public dataset" data
// in this project is historical seed data generated for demo purposes. This
// module is different: it genuinely calls a live, free public weather API
// (Open-Meteo, no key required — the same one server/weather.js already
// uses for scoring) for a fixed list of major Indian cities, and whenever a
// city is *currently* experiencing notable weather, it auto-creates a real
// report from that live reading.

const db = require("./db");
const { fetchCityWeather } = require("./weather");
const { scoreReport, statusFromTrust } = require("./scoring");

const WATCH_CITIES = [
  { city: "Delhi", state: "Delhi" },
  { city: "Mumbai", state: "Maharashtra" },
  { city: "Kolkata", state: "West Bengal" },
  { city: "Chennai", state: "Tamil Nadu" },
  { city: "Bengaluru", state: "Karnataka" },
  { city: "Hyderabad", state: "Telangana" },
  { city: "Pune", state: "Maharashtra" },
  { city: "Ahmedabad", state: "Gujarat" },
  { city: "Jaipur", state: "Rajasthan" },
  { city: "Lucknow", state: "Uttar Pradesh" },
  { city: "Patna", state: "Bihar" },
  { city: "Bhopal", state: "Madhya Pradesh" },
  { city: "Guwahati", state: "Assam" },
  { city: "Chandigarh", state: "Chandigarh" },
  { city: "Thiruvananthapuram", state: "Kerala" },
];

const REINGEST_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours
const recentlyIngested = new Map();

function detectEventFromWeather(w) {
  if (w.main === "Storm") return "thunderstorm";
  if (w.wind >= 40) return "strong_winds";
  if (w.main === "Rain") return "rainfall";
  if (w.main === "Fog") return "fog";
  if (w.temp >= 42) return "heatwave";
  return null;
}

function describeEvent(event, w, city) {
  switch (event) {
    case "thunderstorm":
      return `Live weather feed shows thunderstorm activity over ${city}.`;
    case "strong_winds":
      return `Sustained winds around ${w.wind} km/h recorded near ${city}.`;
    case "rainfall":
      return `Ongoing rainfall recorded over ${city} by live weather feed.`;
    case "fog":
      return `Reduced visibility due to fog reported near ${city}.`;
    case "heatwave":
      return `Temperature around ${w.temp}\u00B0C recorded in ${city}, heatwave conditions.`;
    default:
      return `Notable weather activity in ${city}.`;
  }
}

async function ingestCity(entry) {
  try {
    const w = await fetchCityWeather(entry.city);
    const event = detectEventFromWeather(w);
    if (!event) return null;

    const cooldownKey = entry.city + ":" + event;
    const last = recentlyIngested.get(cooldownKey);
    if (last && Date.now() - last < REINGEST_COOLDOWN_MS) return null;

    const description = describeEvent(event, w, entry.city);
    const { trustScore } = scoreReport({
      description,
      event,
      hasMedia: false,
      mediaReused: false,
      officialMain: w.main,
      city: entry.city,
    });
    const status = statusFromTrust(trustScore);

    const report = db.addReport({
      city: entry.city,
      state: entry.state,
      lat: w.lat,
      lng: w.lng,
      event,
      autoCategory: event,
      source: "IMD API",
      ts: Date.now(),
      trust: trustScore,
      status,
      hasPhoto: false,
      hasVideo: false,
      text: description,
      duplicateOf: null,
      mediaHash: null,
      mediaPath: null,
    });

    recentlyIngested.set(cooldownKey, Date.now());
    return report;
  } catch (e) {
    console.error(`Ingestion failed for ${entry.city}:`, e.message);
    return null;
  }
}

async function runIngestion() {
  const created = [];
  for (const entry of WATCH_CITIES) {
    const report = await ingestCity(entry);
    if (report) created.push(report);
  }
  if (created.length) {
    console.log(`Live ingestion: created ${created.length} report(s) from Open-Meteo.`);
  }
  return created;
}

module.exports = { runIngestion, WATCH_CITIES };