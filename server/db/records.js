const { ObjectId, Decimal128 } = require('mongodb');

// Monetary values are stored as Decimal128 with two decimal places, the MongoDB equivalent of
// PostgreSQL numeric(18, 2). They are summed in the database and converted to cents (BigInt)
// for balances, so no binary floating-point rounding enters any total.
function parseMoney(value, { minimum = 0.01, message = 'Amount must be greater than zero' } = {}) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^\+?(\d+)(?:\.(\d+))?$/);
  if (!match) throw Object.assign(new Error(message), { status: 400 });
  const fraction = (match[2] || '').replace(/0+$/, '');
  if (fraction.length > 2) throw Object.assign(new Error(message), { status: 400 });
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < minimum || amount >= 1e16) {
    throw Object.assign(new Error(message), { status: 400 });
  }
  return `${BigInt(match[1])}.${fraction.padEnd(2, '0')}`;
}

const decimal = (value) => Decimal128.fromString(String(value));
const ZERO = decimal('0.00');

function toCents(value) {
  if (value == null) return 0n;
  if (typeof value === 'bigint') return value * 100n;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Database returned an invalid monetary value');
    return BigInt(Math.round(value * 100));
  }
  const text = value.toString();
  const match = text.match(/^([+-])?(\d+)(?:\.(\d+))?(?:E([+-]?\d+))?$/i);
  if (!match) throw new Error('Database returned an invalid monetary value');
  const [, sign, whole, fraction = '', exponent = '0'] = match;
  let digits = BigInt(whole + fraction);
  let scale = fraction.length - Number(exponent); // value = digits * 10^-scale
  while (scale > 2) {
    if (digits % 10n !== 0n) throw new Error('Monetary value has more than two decimal places');
    digits /= 10n;
    scale -= 1;
  }
  while (scale < 2) {
    digits *= 10n;
    scale += 1;
  }
  return sign === '-' ? -digits : digits;
}

function fromCents(cents) {
  return Number(cents) / 100;
}

function centsToDecimal(cents) {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return decimal(
    `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`,
  );
}

// Converts a stored document into the JSON shape the API has always returned: ObjectIds become
// 24-character hex strings and Decimal128 values become numbers.
function toApi(value) {
  if (value == null) return value;
  if (value instanceof ObjectId) return value.toHexString();
  if (value instanceof Decimal128) return Number(value.toString());
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(toApi);
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) result[key] = toApi(entry);
    }
    return result;
  }
  return value;
}

const objectId = (hex) => ObjectId.createFromHexString(hex);
const objectIds = (hexes) => hexes.map(objectId);
const newId = () => new ObjectId();

function mongoErrorStatus(error) {
  // Document validation failures are the equivalent of PostgreSQL CHECK violations.
  if (error && error.code === 121) return 400;
  return null;
}

module.exports = {
  parseMoney,
  decimal,
  ZERO,
  toCents,
  fromCents,
  centsToDecimal,
  toApi,
  objectId,
  objectIds,
  newId,
  mongoErrorStatus,
};
