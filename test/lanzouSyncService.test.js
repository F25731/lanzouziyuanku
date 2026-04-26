const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSyncInput } = require('../services/lanzouSyncService');

test('buildSyncInput disables share url generation for fast scanning', () => {
  const input = buildSyncInput({
    provider: 'ilanzou',
    root_folder_id: 0,
    login_type: 'account',
    account: 'demo',
    password_text: 'secret',
    cookie_text: null
  });

  assert.equal(input.provider, 'ilanzou');
  assert.equal(input.rootFolderId, 0);
  assert.equal(input.loginType, 'account');
  assert.equal(input.includeShareUrls, false);
});
