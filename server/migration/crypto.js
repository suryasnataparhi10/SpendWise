// Encryption for migration packages (passphrase chosen by the administrator) and for the
// server-held copies (staged uploads and backups), which use a key derived on the server.
const crypto = require('node:crypto');

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 32 };
const MIN_PASSPHRASE = 12;

function checkPassphrase(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE || passphrase.length > 256)
    throw Object.assign(new Error(`Use a package passphrase of at least ${MIN_PASSPHRASE} characters`), {
      status: 400,
    });
}

function deriveKey(passphrase, salt, params = SCRYPT) {
  return crypto.scryptSync(passphrase, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * params.N * params.r * 2,
  });
}

function seal(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

function open(key, { iv, tag, ciphertext }, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function encryptWithPassphrase(plaintext, passphrase, aad) {
  checkPassphrase(passphrase);
  const salt = crypto.randomBytes(16);
  const sealed = seal(deriveKey(passphrase, salt), plaintext, aad);
  return {
    encryption: {
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      kdfParams: { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p },
      salt: salt.toString('base64'),
      iv: sealed.iv.toString('base64'),
      tag: sealed.tag.toString('base64'),
    },
    ciphertext: sealed.ciphertext,
  };
}

function decryptWithPassphrase(ciphertext, encryption, passphrase, aad) {
  if (typeof passphrase !== 'string' || !passphrase)
    throw Object.assign(new Error('Enter the package passphrase'), { status: 400 });
  if (encryption?.algorithm !== 'aes-256-gcm' || encryption?.kdf !== 'scrypt')
    throw Object.assign(new Error('Unsupported package encryption'), { status: 400 });
  const { N, r, p } = encryption.kdfParams || {};
  if (![N, r, p].every(Number.isInteger) || N > 2 ** 20 || r > 16 || p > 4)
    throw Object.assign(new Error('Unsupported package encryption parameters'), { status: 400 });
  const key = deriveKey(passphrase, Buffer.from(encryption.salt, 'base64'), { N, r, p, keyLength: 32 });
  try {
    return open(
      key,
      { iv: Buffer.from(encryption.iv, 'base64'), tag: Buffer.from(encryption.tag, 'base64'), ciphertext },
      aad,
    );
  } catch {
    throw Object.assign(
      new Error('The passphrase is incorrect, or the package has been modified'),
      { status: 400 },
    );
  }
}

// Server-side key for staged data and backups. Set MIGRATION_ENCRYPTION_KEY to keep backups
// readable even if JWT_SECRET is rotated.
function serverKey() {
  const secret = process.env.MIGRATION_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('MIGRATION_ENCRYPTION_KEY or JWT_SECRET must be configured');
  return Buffer.from(crypto.hkdfSync('sha256', secret, 'spendwise-migration', 'server-storage', 32));
}

function encryptForServer(plaintext) {
  const sealed = seal(serverKey(), plaintext);
  return Buffer.concat([Buffer.from('SWM1'), sealed.iv, sealed.tag, sealed.ciphertext]);
}

function decryptFromServer(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'SWM1') throw new Error('Unrecognised server-encrypted file');
  try {
    return open(serverKey(), {
      iv: buffer.subarray(4, 16),
      tag: buffer.subarray(16, 32),
      ciphertext: buffer.subarray(32),
    });
  } catch {
    throw new Error('Stored migration data could not be decrypted (was the encryption key changed?)');
  }
}

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

module.exports = {
  checkPassphrase,
  encryptWithPassphrase,
  decryptWithPassphrase,
  encryptForServer,
  decryptFromServer,
  sha256,
  MIN_PASSPHRASE,
};
