const express = require('express');
const { collection } = require('../db');
const auth = require('../middleware/auth');
const { objectId, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');

const router = express.Router();
router.use(auth);

function isBase64(value, minimumBytes, maximumBytes) {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    return false;
  const bytes = Buffer.from(value, 'base64');
  return (
    bytes.length >= minimumBytes &&
    bytes.length <= maximumBytes &&
    bytes.toString('base64') === value
  );
}

// The vault is encrypted in the browser; the server only stores the opaque payload.
const vaultResponse = (vault) =>
  vault
    ? { salt: vault.salt, iv: vault.iv, ciphertext: vault.ciphertext, updated_at: vault.updatedAt }
    : null;

router.get(
  '/',
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const vault = await collection('passwordVaults').findOne({ userId: objectId(req.uid) });
    ok(res, vaultResponse(vault));
  }),
);

router.put(
  '/',
  wrap(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { salt, iv, ciphertext } = req.body || {};
    if (!isBase64(salt, 16, 16) || !isBase64(iv, 12, 12) || !isBase64(ciphertext, 17, 700_000)) {
      throw fail(400, 'Invalid encrypted vault data');
    }
    const userId = objectId(req.uid);
    const save = () =>
      collection('passwordVaults').findOneAndUpdate(
        { userId },
        { $set: { salt, iv, ciphertext, updatedAt: new Date() }, $setOnInsert: { _id: newId() } },
        { upsert: true, returnDocument: 'after' },
      );
    let vault;
    try {
      vault = await save();
    } catch (error) {
      if (error.code !== 11000) throw error;
      vault = await save();
    }
    ok(res, vaultResponse(vault), 'Encrypted vault saved');
  }),
);

module.exports = router;
