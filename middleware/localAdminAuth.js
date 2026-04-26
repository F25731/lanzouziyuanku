function getConfiguredToken(options = {}) {
  return String(
    options.token ||
    process.env.ADMIN_API_TOKEN ||
    process.env.ADMIN_INIT_PASSWORD ||
    'admin123456'
  ).trim();
}

function localAdminCors(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
}

function createLocalAdminAuth(options = {}) {
  return function localAdminAuth(req, res, next) {
    const configuredToken = getConfiguredToken(options);
    const providedToken = String(req.get('X-Admin-Token') || '').trim();

    if (!configuredToken || providedToken !== configuredToken) {
      return res.status(403).json({ message: 'Invalid local admin token' });
    }

    return next();
  };
}

module.exports = {
  createLocalAdminAuth,
  getConfiguredToken,
  localAdminCors
};
