// Perceptual hashing for near-duplicate image detection.
//
// The existing SHA-256 mediaHash in reports.js only catches byte-for-byte
// identical files — reuse a resized copy, re-save as a different quality
// JPEG, or crop a few pixels, and it slips straight past it. A difference
// hash (dHash) instead looks at the image's actual visual content: shrink
// it down, compare neighbouring pixel brightness, and encode that as a
// 64-bit fingerprint. Two photos of the same scene end up with very similar
// fingerprints even after resizing/re-compression; two unrelated photos
// don't.

const Jimp = require("jimp");

const HASH_SIZE = 8; // 8x8 grid -> 64-bit hash

async function computePerceptualHash(buffer) {
  const image = await Jimp.read(buffer);
  image.resize(HASH_SIZE + 1, HASH_SIZE).grayscale();

  let bits = "";
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      const left = Jimp.intToRGBA(image.getPixelColor(x, y)).r;
      const right = Jimp.intToRGBA(image.getPixelColor(x + 1, y)).r;
      bits += left > right ? "1" : "0";
    }
  }
  return bits;
}

function hammingDistance(hashA, hashB) {
  if (!hashA || !hashB || hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) dist++;
  }
  return dist;
}

module.exports = { computePerceptualHash, hammingDistance };