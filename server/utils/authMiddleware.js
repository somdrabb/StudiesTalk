function requireAuth(req, res, next) {
  const userId = req.headers['x-user-id'] || req.headers['x-user-token'];
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = {
    id: userId,
    name: req.headers['x-user-name'] || 'Authenticated User',
    email: req.headers['x-user-email'],
  };

  next();
}

module.exports = {
  requireAuth,
};
