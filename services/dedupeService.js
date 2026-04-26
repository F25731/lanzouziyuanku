function stripExtension(name) {
  return String(name || '').replace(/\.[A-Za-z0-9]{1,8}$/i, '');
}

function compactText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[《》「」『』【】\[\]（）(){}]/g, '')
    .replace(/[·•、，,。.:：_+\s]/g, '');
}

function extractNovelAuthor(name) {
  const text = stripExtension(name);
  const labeled = text.match(/(?:作者|著)\s*[:：]?\s*([A-Za-z0-9_\-\u4e00-\u9fa5·]+)/i);
  if (labeled) return compactText(labeled[1]);

  const dashed = text.match(/[-－—]\s*([\u4e00-\u9fa5A-Za-z0-9_·]{2,24})\s*$/);
  if (dashed) return compactText(dashed[1]);

  return '';
}

function isNovelLike(name) {
  return /(?:作者|著)\s*[:：]?|[《》【】]|完结|全集|全本|精校版|校对版|典藏版|修订版|未删减版|番外|epub|txt|mobi|azw3/i.test(String(name || ''));
}

function normalizeNovelTitle(name) {
  let text = stripExtension(name);
  text = text.replace(/(?:作者|著)\s*[:：]?\s*[A-Za-z0-9_\-\u4e00-\u9fa5·]+/gi, ' ');
  text = text.replace(/[-－—]\s*[\u4e00-\u9fa5A-Za-z0-9_·]{2,24}\s*$/i, ' ');
  text = text.replace(/[【\[][^】\]]{0,30}[】\]]/g, ' ');
  text = text.replace(/[（(][^）)]{0,30}[）)]/g, ' ');
  text = text.replace(/完结|全集|全本|精校版|校对版|典藏版|修订版|未删减版|插图版|文字版|番外|epub|txt|pdf|mobi|azw3/gi, ' ');
  return compactText(text);
}

function buildNovelDedupeKey(name) {
  const raw = compactText(stripExtension(name));
  if (!isNovelLike(name)) return raw;

  const title = normalizeNovelTitle(name);
  const author = extractNovelAuthor(name);
  return title ? `${title}|${author}` : raw;
}

function getFormatScore(name, fileType) {
  const ext = (String(name || '').match(/\.([A-Za-z0-9]{1,8})$/) || [null, ''])[1].toLowerCase();
  const fmt = String(fileType || ext || '').trim().toLowerCase();
  if (fmt === 'txt') return 3;
  if (fmt === 'epub') return 2;
  if (fmt === 'azw3' || fmt === 'mobi') return 1;
  if (fmt === 'pdf') return 0;
  return 0;
}

function getNovelPriorityScore(name, fileType) {
  const text = String(name || '');
  let score = 0;
  if (/精校版|校对版/i.test(text)) score += 50;
  if (/全本|全集|完结/i.test(text)) score += 40;
  if (/典藏版|修订版|未删减版/i.test(text)) score += 30;
  if (/插图版|文字版/i.test(text)) score += 10;
  if (/番外/i.test(text)) score -= 20;
  score += getFormatScore(name, fileType);
  return score;
}

function dedupeSearchResults(rows) {
  const grouped = new Map();
  const sourceRows = Array.isArray(rows) ? rows : [];

  for (const item of sourceRows) {
    const key = buildNovelDedupeKey(item.file_name || item.name || '');
    const candidate = {
      ...item,
      variant_count: 1,
      priority_score: getNovelPriorityScore(item.file_name || item.name || '', item.file_type || item.type || '')
    };
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, candidate);
      continue;
    }

    const nextCount = Number(current.variant_count || 1) + 1;
    if (
      candidate.priority_score > current.priority_score ||
      (candidate.priority_score === current.priority_score && Number(candidate.id || 0) > Number(current.id || 0))
    ) {
      candidate.variant_count = nextCount;
      grouped.set(key, candidate);
    } else {
      current.variant_count = nextCount;
    }
  }

  return {
    items: Array.from(grouped.values()).map(({ priority_score, ...rest }) => rest),
    total: grouped.size,
    rawTotal: sourceRows.length
  };
}

module.exports = {
  buildNovelDedupeKey,
  dedupeSearchResults,
  extractNovelAuthor,
  getFormatScore,
  getNovelPriorityScore,
  isNovelLike,
  normalizeNovelTitle
};
