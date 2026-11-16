const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const { collection } = require('../db');
const auth = require('../middleware/auth');
const { toApi, objectId, newId } = require('../db/records');
const { ok, fail, wrap } = require('../utils/http');
const router = express.Router();
// Stored for new accounts; matches the original PostgreSQL column default.
const STORED_THEME_DEFAULT = { appearance: 'light', colorTheme: 'midnight-mint', customAccent: '#7c6ee8' };
const DEFAULT_THEME_PREFERENCES = {
  colorTheme: 'midnight-mint',
  appearance: 'light',
  customAccent: '#7c6ee8',
  customDesign: 'signature',
};
const THEME_IDS = new Set([
  'midnight-mint', 'ocean-blue', 'warm-ledger', 'lavender-graphite', 'sunset-coral',
  'monochrome', 'sage-sand', 'berry-night', 'arctic-frost', 'rosewood', 'citrus-grove',
  'royal-indigo', 'aurora-glow', 'sakura', 'midnight-orchid', 'coastal-sand', 'custom',
  'minimal-light', 'dark-professional', 'glassmorphism', 'modern-gradient', 'neumorphism',
  'material-design', 'forest-green', 'midnight-amoled', 'colorful-creative',
]);
// Design languages a custom theme can be built on; mirrors client/src/theme/designs.js.
const DESIGN_IDS = new Set([
  'signature', 'minimal', 'executive', 'glass', 'vivid', 'soft', 'material', 'editorial', 'precision',
]);
const sign = (user) => ({
  token: jwt.sign({ id: user._id.toHexString() }, process.env.JWT_SECRET, { expiresIn: '7d' }),
  user: {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    avatar: user.avatar || '',
    themePreferences: { ...DEFAULT_THEME_PREFERENCES, ...user.themePreferences },
  },
});
const publicUser = (document) => {
  const user = toApi(document);
  if (!user.id && user._id) user.id = user._id;
  delete user.password;
  delete user.passwordResetTokenHash;
  delete user.passwordResetExpires;
  delete user.hiddenExpenseKeyHash;
  delete user.hiddenExpenseOtpHash;
  delete user.hiddenExpenseOtpExpires;
  delete user.hiddenExpenseOtpSentAt;
  delete user.hiddenExpenseOtpAttempts;
  return user;
};

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (!email || typeof password !== 'string' || password.length < 6)
      throw fail(400, 'Email and a 6+ character password are required');
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    const user = {
      _id: newId(),
      name: name == null ? null : String(name),
      avatar: '',
      email: String(email).toLowerCase(),
      password: passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpires: null,
      hiddenExpenseKeyHash: null,
      hiddenExpenseOtpHash: null,
      hiddenExpenseOtpExpires: null,
      hiddenExpenseOtpSentAt: null,
      hiddenExpenseOtpAttempts: null,
      createdAt: now,
      updatedAt: now,
      themePreferences: { ...STORED_THEME_DEFAULT },
    };
    try {
      await collection('users').insertOne(user);
    } catch (error) {
      if (error.code === 11000) throw fail(409, 'Email already registered');
      throw error;
    }
    ok(res, sign(user), 'Registered', 201);
  }),
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const user = await collection('users').findOne(
      { email: String(req.body.email || '').toLowerCase() },
      { projection: { name: 1, email: 1, avatar: 1, password: 1, themePreferences: 1 } },
    );
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password)))
      throw fail(401, 'Invalid email or password');
    ok(res, sign(user), 'Logged in');
  }),
);

router.post(
  '/forgot-password',
  wrap(async (req, res) => {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();
    if (!email) throw fail(400, 'Email is required');
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS)
      throw fail(
        503,
        'Password reset email is not configured. Ask the administrator to configure SMTP.',
      );
    const user = await collection('users').findOne({ email }, { projection: { email: 1 } });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      await collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
            updatedAt: new Date(),
          },
        },
      );
      const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || 'false') === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'Reset your SpendWise password',
        text: `Use this link to reset your password. It expires in 30 minutes: ${clientUrl}/reset-password/${token}`,
      });
    }
    ok(res, {
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  }),
);

router.post(
  '/reset-password',
  wrap(async (req, res) => {
    const { token, password } = req.body;
    if (typeof password !== 'string' || password.length < 6)
      throw fail(400, 'Password must be at least 6 characters');
    if (typeof token !== 'string' || !token) throw fail(400, 'Reset token is invalid or expired');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();
    const result = await collection('users').updateOne(
      { passwordResetTokenHash: tokenHash, passwordResetExpires: { $gt: now } },
      {
        $set: {
          password: passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpires: null,
          updatedAt: now,
        },
      },
    );
    if (!result.matchedCount) throw fail(400, 'Reset link is invalid or has expired');
    ok(res, { message: 'Password updated. You can now sign in.' });
  }),
);

router.get(
  '/me',
  auth,
  wrap(async (req, res) => {
    const user = await collection('users').findOne({ _id: objectId(req.uid) });
    if (!user) throw fail(401, 'Not authorized');
    ok(res, publicUser(user));
  }),
);

router.patch(
  '/profile',
  auth,
  wrap(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const { avatar } = req.body;
    if (!name || name.length > 60) throw fail(400, 'Name must be between 1 and 60 characters');
    if (avatar !== undefined && avatar !== '') {
      if (typeof avatar !== 'string') throw fail(400, 'Choose a valid JPG, PNG, or WebP image');
      const match = avatar.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match || match[2].length % 4 !== 0) {
        throw fail(400, 'Choose a valid JPG, PNG, or WebP image');
      }
      const image = Buffer.from(match[2], 'base64');
      const isJpeg = match[1] === 'jpeg' && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
      const isPng = match[1] === 'png' && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isWebp = match[1] === 'webp' && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
      if (
        image.length === 0 ||
        image.length > 675_000 ||
        image.toString('base64') !== match[2] ||
        !(isJpeg || isPng || isWebp)
      ) {
        throw fail(400, 'Choose a valid JPG, PNG, or WebP image smaller than 650 KB');
      }
    }
    // COALESCE($avatar, avatar): an omitted (or null) avatar keeps the current one.
    const changes = { name, updatedAt: new Date() };
    if (avatar !== undefined && avatar !== null) changes.avatar = avatar;
    const user = await collection('users').findOneAndUpdate(
      { _id: objectId(req.uid) },
      { $set: changes },
      { returnDocument: 'after' },
    );
    if (!user) throw fail(401, 'Not authorized');
    ok(res, publicUser(user), 'Profile updated');
  }),
);

router.patch(
  '/theme-preferences',
  auth,
  wrap(async (req, res) => {
    const preferences = req.body;
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw fail(400, 'Theme preferences are invalid');
    }
    const allowedKeys = new Set(['colorTheme', 'appearance', 'customAccent', 'customDesign']);
    if (Object.keys(preferences).some((key) => !allowedKeys.has(key))) {
      throw fail(400, 'Theme preferences contain an unsupported setting');
    }
    if (
      ('colorTheme' in preferences &&
        (typeof preferences.colorTheme !== 'string' || !THEME_IDS.has(preferences.colorTheme))) ||
      ('appearance' in preferences &&
        !['light', 'dark', 'system'].includes(preferences.appearance)) ||
      ('customAccent' in preferences &&
        (typeof preferences.customAccent !== 'string' ||
          !/^#[\da-f]{6}$/i.test(preferences.customAccent))) ||
      ('customDesign' in preferences &&
        (typeof preferences.customDesign !== 'string' || !DESIGN_IDS.has(preferences.customDesign)))
    ) {
      throw fail(400, 'Theme preferences are invalid');
    }
    // Merge only the validated keys, like jsonb concatenation (theme_preferences || $1).
    const changes = { updatedAt: new Date() };
    for (const key of allowedKeys) {
      if (key in preferences) changes[`themePreferences.${key}`] = preferences[key];
    }
    const user = await collection('users').findOneAndUpdate(
      { _id: objectId(req.uid) },
      { $set: changes },
      { returnDocument: 'after' },
    );
    if (!user) throw fail(401, 'Not authorized');
    ok(res, publicUser(user), 'Theme preferences saved');
  }),
);

module.exports = router;
