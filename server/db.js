// MongoDB-backed data store (migrated from the original JSON-file store).
//
// Every other file in this project only talks to the functions exported
// here — none of them know or care that reports live in MongoDB instead of
// a JSON file on disk. That's deliberate: it's the same function names and
// shapes as before, just async now, so the migration didn't touch scoring,
// routes, or the ingestion job's actual logic — only added `await`.
//
// This also fixes a real limitation of the old JSON-file store: on
// Render's free tier the disk is ephemeral, so every redeploy/restart wiped
// all citizen-submitted and live-ingested reports back to just the seed
// data. A real external database persists across restarts.
//
// Needs MONGODB_URI set in the environment — a free MongoDB Atlas cluster
// is enough for this scale.

const { MongoClient } = require("mongodb");

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "varshanet";

let client = null;
let dbHandle = null;
let reportsCollection = null;
let countersCollection = null;
let adminsCollection = null;
let connectPromise = null;

async function connect() {
  if (dbHandle) return dbHandle;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not set — add it to your environment variables.");
    }
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    dbHandle = client.db(DB_NAME);
        reportsCollection = dbHandle.collection("reports");
    countersCollection = dbHandle.collection("counters");
    adminsCollection = dbHandle.collection("admins");
    await reportsCollection.createIndex({ id: 1 }, { unique: true });
    await reportsCollection.createIndex({ mediaHash: 1 });
    await adminsCollection.createIndex({ username: 1 }, { unique: true });
    return dbHandle;
  })();

  return connectPromise;
}

// Atomically reserves the next numeric id, so concurrent submissions never
// collide even though the "id" field itself isn't Mongo's own _id.
async function nextSequence() {
  const result = await countersCollection.findOneAndUpdate(
    { _id: "reportId" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return result.seq;
}

// Mongo's own _id is an internal detail the rest of the app never asked
// for — strip it so documents look exactly like the old JSON-file rows.
function stripMongoId(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function getAllReports() {
  await connect();
  const docs = await reportsCollection.find({}).sort({ id: 1 }).toArray();
  return docs.map(stripMongoId);
}

async function addReport(reportWithoutId) {
  await connect();
  const id = await nextSequence();
  const report = { id, ...reportWithoutId };
  await reportsCollection.insertOne(report);
  return stripMongoId(report);
}

async function updateReportStatus(id, status) {
  await connect();
  const update = { $set: { status } };
  if (status === "verified") update.$set.duplicateOf = null;
  const updated = await reportsCollection.findOneAndUpdate({ id }, update, {
    returnDocument: "after",
  });
  return stripMongoId(updated);
}

async function findByMediaHash(hash) {
  if (!hash) return null;
  await connect();
  const doc = await reportsCollection.findOne({ mediaHash: hash });
  return stripMongoId(doc);
}

// Scans existing reports for one whose image "looks like" this one — same
// underlying photo, just resized, re-compressed, or lightly edited — even
// though the file bytes (and therefore mediaHash) don't match exactly.
async function findNearDuplicateByPerceptualHash(hash, maxDistance) {
  if (!hash) return null;
  await connect();
  const { hammingDistance } = require("./perceptualHash");
  const candidates = await reportsCollection
    .find({ perceptualHash: { $exists: true, $ne: null } })
    .toArray();

  let best = null;
  let bestDist = Infinity;
  candidates.forEach((r) => {
    const dist = hammingDistance(hash, r.perceptualHash);
    if (dist <= maxDistance && dist < bestDist) {
      bestDist = dist;
      best = r;
    }
  });
  return stripMongoId(best);
}

// --- Admin accounts ---
// A flat, unranked list of admin logins — anyone already logged in can add
// another. Appropriate for a small moderation team at this scale; nothing
// here assumes only one admin exists anymore.

async function getAdminByUsername(username) {
  await connect();
  const doc = await adminsCollection.findOne({ username });
  return stripMongoId(doc);
}

async function createAdmin(username, passwordHash) {
  await connect();
  const existing = await adminsCollection.findOne({ username });
  if (existing) throw new Error("An admin with that username already exists.");
  const admin = { username, passwordHash, createdAt: Date.now() };
  await adminsCollection.insertOne(admin);
  return stripMongoId(admin);
}

async function listAdminUsernames() {
  await connect();
  const docs = await adminsCollection
    .find({}, { projection: { username: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map((d) => ({ username: d.username, createdAt: d.createdAt }));
}

// Bootstraps the very first admin from the ADMIN_USERNAME/ADMIN_PASSWORD_HASH
// env vars (the original single-admin setup), so existing deployments keep
// working without any manual migration step. No-ops once any admin exists.
async function seedDefaultAdminIfEmpty(username, passwordHash) {
  await connect();
  const count = await adminsCollection.countDocuments();
  if (count > 0) return false;
  if (!username || !passwordHash) return false;
  await adminsCollection.insertOne({ username, passwordHash, createdAt: Date.now() });
  return true;
}

// Only seeds if the collection is currently empty — safe to call on every
// boot.
async function bulkSeed(reports) {
  await connect();
  const count = await reportsCollection.countDocuments();
  if (count > 0) return false;
  if (!reports.length) return false;

  let nextId = 0;
  const withIds = reports.map((r) => ({ id: nextId++, ...r }));
  await reportsCollection.insertMany(withIds);
  await countersCollection.updateOne(
    { _id: "reportId" },
    { $set: { seq: nextId - 1 } },
    { upsert: true }
  );
  return true;
}

module.exports = {
  connect,
  getAllReports,
  addReport,
  updateReportStatus,
  findByMediaHash,
  findNearDuplicateByPerceptualHash,
  bulkSeed,
  getAdminByUsername,
  createAdmin,
  listAdminUsernames,
  seedDefaultAdminIfEmpty,
};