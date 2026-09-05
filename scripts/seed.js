// Manual reseed — the server already auto-seeds on first boot if the
// reports collection is empty, so you normally don't need to run this.
// Useful if you want to wipe demo data: drop the "reports" collection in
// MongoDB (via Atlas's web UI, or `db.reports.drop()` in a Mongo shell),
// then run `npm run seed` (or just restart the server, which does the same
// thing automatically).

const db = require("../server/db");
const { generateSeedReports } = require("../server/seedData");

async function main() {
  const existing = await db.getAllReports();
  if (existing.length > 0) {
    console.log(`Database already has ${existing.length} reports — not touching it.`);
    console.log("Drop the reports collection in MongoDB first if you want to reseed from scratch.");
    process.exit(0);
  }

  const seeded = generateSeedReports(220);
  await db.bulkSeed(seeded);
  console.log(`Seeded ${seeded.length} demo reports into MongoDB`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});