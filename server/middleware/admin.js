// Administrator guard. Administrators are the accounts whose email address is listed in the
// ADMIN_EMAILS server setting (comma-separated). Must run after the auth middleware.
const { collection } = require('../db');
const { objectId } = require('../db/records');
const { fail } = require('../utils/http');

const adminEmails = () =>
  new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

async function loadAdmin(uid) {
  const user = await collection('users').findOne({ _id: objectId(uid) }, { projection: { email: 1, name: 1 } });
  if (!user || !adminEmails().has(String(user.email).toLowerCase())) return null;
  return { id: uid, email: user.email, name: user.name || null };
}

function requireAdmin(onDenied) {
  return async (req, res, next) => {
    try {
      const admin = await loadAdmin(req.uid);
      if (!admin) {
        await onDenied?.(req).catch(() => {});
        return next(fail(403, 'Administrator access is required'));
      }
      req.admin = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireAdmin, loadAdmin, adminEmails };
