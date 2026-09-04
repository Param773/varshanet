// Genuine ML text classifier for report credibility — this is a trained
// Naive Bayes model (via the `natural` NLP library), not a keyword list.
// The existing SUSPICIOUS_WORDS check in scoring.js only catches an exact
// handful of words ("fake", "prank", etc.) and is trivially bypassed by
// rephrasing. This classifier instead learns the broader *style* of
// misleading/spammy text (urgency, unverifiable hearsay, sensationalism)
// versus calm, descriptive genuine weather reports, so it can flag text
// that "reads like" misinformation even when it avoids those exact words.
//
// It's intentionally small and simple — appropriate for a hackathon
// prototype — but it is a real statistical model trained on labelled
// examples, which is what the problem statement asks for.

const natural = require("natural");

// Labelled training examples. "credible" = how genuine citizen weather
// reports typically read: calm, specific, descriptive. "suspicious" =
// patterns common in misinformation/spam/hoax posts: urgency, unverifiable
// hearsay, sensational claims, clickbait phrasing.
const TRAINING_DATA = [
  // --- credible ---
  { text: "Heavy rain since morning, water pooling near the main market", label: "credible" },
  { text: "Visibility near zero for ten minutes during the dust squall", label: "credible" },
  { text: "Roof sheets flew off a shed during this evening's gusts", label: "credible" },
  { text: "Dense fog since 4am, visibility under 50 metres on the expressway", label: "credible" },
  { text: "Loud thunder and lightning for the past 20 minutes, power flickering", label: "credible" },
  { text: "River level rising fast, embankment road partially submerged", label: "credible" },
  { text: "Continuous drizzle across the area, visibility dropping on the highway", label: "credible" },
  { text: "Third day of extreme heat, hospitals reporting heat exhaustion cases", label: "credible" },
  { text: "Sudden downpour, streets flooding near the railway crossing", label: "credible" },
  { text: "Gusty winds uprooted a tree near the park entrance", label: "credible" },
  { text: "Morning trains delayed due to thick fog cover", label: "credible" },
  { text: "Waterlogging outside the metro station, knee deep in places", label: "credible" },
  { text: "Power lines swaying badly, one transformer tripped locally", label: "credible" },
  { text: "Dust storm reduced visibility, shopkeepers closing early", label: "credible" },
  { text: "Light rain expected to continue through the evening, roads slippery", label: "credible" },
  { text: "Hailstorm damaged some crops in the outskirts this afternoon", label: "credible" },
  { text: "Strong winds knocked over a few electric poles near the highway", label: "credible" },
  { text: "Temperature crossed forty degrees today, advisory issued for outdoor work", label: "credible" },
  { text: "Low lying colony flooded after last night's rain, residents evacuating", label: "credible" },
  { text: "Sky turned orange from the dust, sky cleared after an hour", label: "credible" },
  { text: "Overnight thunderstorm knocked out power in parts of the neighbourhood", label: "credible" },
  { text: "Fog lifted by mid morning, visibility back to normal on the highway", label: "credible" },
  { text: "Localised flooding reported near the canal after heavy overnight rain", label: "credible" },
  { text: "Weather department has issued a yellow alert for heavy rain tomorrow", label: "credible" },
  { text: "Wind speed picked up suddenly around noon, tin roofs rattling", label: "credible" },
  { text: "Rain has been steady since last night, drainage struggling to cope", label: "credible" },
  { text: "Air quality dropped and visibility reduced due to dust in the air", label: "credible" },
  { text: "Farmers worried as unseasonal rain has damaged the standing crop", label: "credible" },
  { text: "Traffic moving slowly due to waterlogged underpass this morning", label: "credible" },
  { text: "Cool breeze after the rain brought some relief from the heat", label: "credible" },

  // --- suspicious ---
  { text: "BREAKING worst disaster in history happening right now share this", label: "suspicious" },
  { text: "You wont believe what just happened outside my window click here", label: "suspicious" },
  { text: "Government is hiding the truth about this storm wake up people", label: "suspicious" },
  { text: "This is not a drill something unnatural caused this weather spread the word", label: "suspicious" },
  { text: "100 percent confirmed this is the end of the world weather event today", label: "suspicious" },
  { text: "Shocking photos inside the storm destroyed everything click to see more", label: "suspicious" },
  { text: "Mainstream media wont show you this real disaster share before its deleted", label: "suspicious" },
  { text: "I heard from a friend of a friend that the entire city is underwater", label: "suspicious" },
  { text: "URGENT URGENT everyone needs to see this before its too late", label: "suspicious" },
  { text: "Scientists are shocked by this unprecedented weather nobody can explain it", label: "suspicious" },
  { text: "Forward this to ten people or you will miss the biggest warning ever", label: "suspicious" },
  { text: "They dont want you to know the real cause of this storm expose them", label: "suspicious" },
  { text: "Insane footage you have never seen anything like this before trust me", label: "suspicious" },
  { text: "This proves the conspiracy is real wake up and share everywhere", label: "suspicious" },
  { text: "Unbelievable once in a lifetime event happening only in our city right now", label: "suspicious" },
  { text: "Secret weather weapon test caused this nobody is reporting it", label: "suspicious" },
  { text: "My cousin said the whole area was destroyed but news wont cover it", label: "suspicious" },
  { text: "Click the link below to see the terrifying truth before it gets removed", label: "suspicious" },
  { text: "This is definitely not natural someone is controlling the weather", label: "suspicious" },
  { text: "Everyone is panicking share immediately before they take this down", label: "suspicious" },
  { text: "Exclusive leaked footage shows the real scale nobody is telling you", label: "suspicious" },
  { text: "Rumour has it the government caused this to distract everyone", label: "suspicious" },
  { text: "Cant believe this is happening share before it goes viral everywhere", label: "suspicious" },
  { text: "A friend told me the dam is about to burst any minute now run", label: "suspicious" },
  { text: "This changes everything we thought we knew about the weather here", label: "suspicious" },
  { text: "Warning warning this is worse than anything ever recorded before", label: "suspicious" },
  { text: "They are covering up the real death toll from this storm share now", label: "suspicious" },
  { text: "Someone told me on whatsapp that the whole state is flooded already", label: "suspicious" },
  { text: "This is fake I made it up just to see if people believe anything", label: "suspicious" },
  { text: "Just a prank post ignore this one guys not real at all", label: "suspicious" },
];

const classifier = new natural.BayesClassifier();
TRAINING_DATA.forEach((row) => classifier.addDocument(row.text, row.label));
classifier.train();

/**
 * Classifies free-text report descriptions as "credible" or "suspicious"
 * using the trained Bayes model.
 * @param {string} text
 * @returns {{label: "credible"|"suspicious", confidence: number}|null}
 */
function classifyReportText(text) {
  const trimmed = (text || "").trim();
  if (trimmed.length < 8) return null;

  const scores = classifier.getClassifications(trimmed);
  if (!scores || scores.length < 2) return null;

  const [top, second] = scores;
  const total = top.value + second.value;
  const confidence = total > 0 ? top.value / total : 0.5;

  return { label: top.label, confidence };
}

module.exports = { classifyReportText };