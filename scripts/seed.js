// Manual reseed — the server already auto-seeds on first boot if
// data/reports.json is empty, so you normally don't need to run this.
// Useful if you want to wipe demo data: delete data/reports.json, then run
// `npm run seed` (or just start the server again, which does the same thing).

const db = require("../server/db");
const { generateSeedReports } = require("../server/seedData");

const existing = db.getAllReports();
if (existing.length > 0) {
  console.log(`data/reports.json already has ${existing.length} reports — not touching it.`);
  console.log("Delete data/reports.json first if you want to reseed from scratch.");
  process.exit(0);
}

const seeded = generateSeedReports(220);
db.bulkSeed(seeded);
console.log(`Seeded ${seeded.length} demo reports into data/reports.json`);
