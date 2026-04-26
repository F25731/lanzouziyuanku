function requireLogin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ message: '请先登录' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.admin || req.session.admin.role !== 'admin') {
    return res.status(403).json({ message: '无权限访问' });
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session?.admin || req.session.admin.role !== 'admin') {
    return res.redirect('/admin/login');
  }
  next();
}

function isMembershipActive(user) {
  if (!user?.membership_expire_at) return false;
  return new Date(user.membership_expire_at).getTime() > Date.now();
}

module.exports = {
  requireLogin,
  requireAdmin,
  requireAdminPage,
  isMembershipActive
};
