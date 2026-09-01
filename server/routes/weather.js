const express = require("express");
const { fetchCityWeather } = require("../weather");

const router = express.Router();

router.get("/", async (req, res) => {
  const city = req.query.city;
  if (!city) return res.status(400).json({ error: "city query param is required" });
  try {
    const data = await fetchCityWeather(city);
    res.json(data);
  } catch (e) {
    res.status(404).json({ error: e.message || "City not found" });
  }
});

module.exports = router;
