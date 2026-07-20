const jwt  = require('jsonwebtoken');
const { User } = require('../models');

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'No token provided' });

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Normalise Oracle UPPERCASE column names to camelCase
    req.user = {
      id:        user.ID        || user.id,
      name:      user.NAME      || user.name,
      email:     user.EMAIL     || user.email,
      avatarUrl: user.AVATAR_URL || user.avatarUrl,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
