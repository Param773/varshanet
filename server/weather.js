// Talks to Open-Meteo's free geocoding + forecast APIs (no key required).
// Ported from the original client-side fetchCityWeather() so both the
// forecast search page and the report-scoring pipeline share one
// implementation, running server-side.

function weatherCodeToMain(code) {
  if ([0, 1].includes(code)) return "Clear";
  if ([2, 3].includes(code)) return "Clouds";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storm";
  return "Clouds";
}

async function safeJson(res) {
  if (!res.ok) throw new Error("Weather service unavailable right now.");
  try {
    return await res.json();
  } catch (e) {
    throw new Error("Weather service unavailable right now.");
  }
}

async function fetchCityWeather(cityName) {
  const geoUrl =
    "https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(cityName);
  const geoRes = await fetch(geoUrl);
  const geo = await safeJson(geoRes);
  if (!geo.results || !geo.results.length) {
    throw new Error("City not found. Try a different spelling.");
  }
  const loc = geo.results[0];
  const wUrl =
    "https://api.open-meteo.com/v1/forecast?latitude=" +
    loc.latitude +
    "&longitude=" +
    loc.longitude +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=auto";
  const wRes = await fetch(wUrl);
  const w = await safeJson(wRes);
  const cur = w.current || {};
  return {
    name: loc.name + (loc.admin1 ? ", " + loc.admin1 : ""),
    lat: loc.latitude,
    lng: loc.longitude,
    temp: Math.round(cur.temperature_2m),
    humidity: Math.round(cur.relative_humidity_2m),
    wind: Math.round(cur.wind_speed_10m),
    main: weatherCodeToMain(cur.weather_code),
  };
}

module.exports = { fetchCityWeather, weatherCodeToMain };
