const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { ok, fail, wrap } = require('../utils/http');
const router = express.Router();
const sign = (user) => ({
  token: jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' }),
  user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar || '' },
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (!email || !password || password.length < 6)
      throw fail(400, 'Email and a 6+ character password are required');
    if (await User.findOne({ email: String(email).toLowerCase() }))
      throw fail(409, 'Email already registered');
    ok(
      res,
      sign(await User.create({ name, email, password: await bcrypt.hash(password, 10) })),
      'Registered',
      201,
    );
  }),
);
router.post(
  '/login',
  wrap(async (req, res) => {
    const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
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
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
      user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
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
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetTokenHash +passwordResetExpires');
    if (!user) throw fail(400, 'Reset link is invalid or has expired');
    user.password = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    ok(res, { message: 'Password updated. You can now sign in.' });
  }),
);
router.get(
  '/me',
  auth,
  wrap(async (req, res) => {
    const user = await User.findById(req.uid).select('-password');
    if (!user) throw fail(401, 'Not authorized');
    ok(res, user);
  }),
);
router.patch(
  '/profile',
  auth,
  wrap(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const avatar = req.body.avatar;
    if (!name || name.length > 60) throw fail(400, 'Name must be between 1 and 60 characters');
    if (avatar !== undefined && avatar !== '' &&
      (typeof avatar !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(avatar) || avatar.length > 900_000)) {
      throw fail(400, 'Choose a valid image smaller than 650 KB');
    }
    const user = await User.findById(req.uid);
    if (!user) throw fail(401, 'Not authorized');
    user.name = name;
    if (avatar !== undefined) user.avatar = avatar;
    await user.save();
    ok(res, { id: user._id, name: user.name, email: user.email, avatar: user.avatar || '' }, 'Profile updated');
  }),
);
module.exports = router;
