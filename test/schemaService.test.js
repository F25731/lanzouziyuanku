const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getPersonalResourceSchemaRequirements
} = require('../services/schemaService');

test('personal resource schema requirements include current runtime columns', () => {
  const requirements = getPersonalResourceSchemaRequirements();
  const columnKeys = requirements.columns.map((item) => `${item.table}.${item.name}`);
  const tableNames = requirements.tables.map((item) => item.name);

  assert.ok(columnKeys.includes('lanzou_accounts.provider'));
  assert.ok(columnKeys.includes('lanzou_accounts.root_folder_id'));
  assert.ok(columnKeys.includes('resources.category'));
  assert.ok(columnKeys.includes('resources.tags'));
  assert.ok(columnKeys.includes('resources.note'));
  assert.ok(columnKeys.includes('resources.status'));
  assert.ok(tableNames.includes('download_logs'));
  assert.ok(tableNames.includes('api_tokens'));
});
