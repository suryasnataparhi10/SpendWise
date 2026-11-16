const jwt = require('jsonwebtoken');
const { fail } = require('../utils/http');

module.exports = (req, res, next) => {
  try {
    const token = (req.headers.authorization || '').slice(7);
    const id = jwt.verify(token, process.env.JWT_SECRET).id;
    if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
      throw new Error('Invalid user id');
    }
    req.uid = id;
    next();
  } catch {
    next(fail(401, 'Not authorized'));
  }
};
