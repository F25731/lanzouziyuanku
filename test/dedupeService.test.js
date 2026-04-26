const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNovelDedupeKey,
  dedupeSearchResults,
  getNovelPriorityScore
} = require('../services/dedupeService');

test('buildNovelDedupeKey normalizes novel title and author', () => {
  const a = buildNovelDedupeKey('诡秘之主 作者：爱潜水的乌贼 精校版.txt');
  const b = buildNovelDedupeKey('【完结】诡秘之主-爱潜水的乌贼.epub');

  assert.equal(a, b);
});

test('dedupeSearchResults keeps preferred novel variant and counts variants', () => {
  const rows = [
    { id: 10, file_name: '诡秘之主 作者：爱潜水的乌贼.epub', file_type: 'epub', share_url: 'a' },
    { id: 11, file_name: '诡秘之主 作者：爱潜水的乌贼 精校版.txt', file_type: 'txt', share_url: 'b' },
    { id: 12, file_name: '诡秘之主 作者：爱潜水的乌贼 番外.pdf', file_type: 'pdf', share_url: 'c' }
  ];

  const result = dedupeSearchResults(rows);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, 11);
  assert.equal(result.items[0].variant_count, 3);
  assert.equal(result.total, 1);
  assert.equal(result.rawTotal, 3);
});

test('getNovelPriorityScore prefers txt over epub when quality labels tie', () => {
  const txt = getNovelPriorityScore('凡人修仙传 精校版.txt', 'txt');
  const epub = getNovelPriorityScore('凡人修仙传 精校版.epub', 'epub');

  assert.ok(txt > epub);
});
