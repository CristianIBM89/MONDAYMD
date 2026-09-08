function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function tokenizePartNumber(value) {
  const normalized = normalize(value);

  if (!normalized) {
    return [];
  }

  return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

function buildSearchText(category) {
  const attributesText = category.attributes
    .map((attribute) => `${attribute.code} ${attribute.shortEs} ${attribute.shortEn} ${attribute.definitionEs} ${attribute.definitionEn}`)
    .join(' ');

  return normalize([
    category.categoryCode,
    category.nameEs,
    category.nameEn,
    category.definitionEs,
    category.definitionEn,
    attributesText,
    (category.searchTokens || []).join(' '),
  ].join(' '));
}

function scoreCategory(category, queryParts) {
  const searchableText = buildSearchText(category);
  let score = 0;

  if (queryParts.partNumber) {
    const normalizedPartNumber = normalize(queryParts.partNumber);
    const partTokens = tokenizePartNumber(queryParts.partNumber);

    if (searchableText.includes(normalizedPartNumber)) {
      score += 20;
    }

    for (const token of partTokens) {
      if (searchableText.includes(token)) {
        score += 6;
      }
    }
  }

  if (queryParts.manufacturer) {
    const normalizedManufacturer = normalize(queryParts.manufacturer);

    if (searchableText.includes(normalizedManufacturer)) {
      score += 5;
    }
  }

  const combinedText = normalize([
    queryParts.description,
    queryParts.userInterpretation,
    queryParts.fileText,
  ].filter(Boolean).join(' '));
  const terms = combinedText.split(/\s+/).filter(Boolean);

  for (const term of terms) {
    if (searchableText.includes(term)) {
      score += 1;
    }
  }

  if (combinedText && searchableText.includes(combinedText)) {
    score += 3;
  }

  return score;
}

function findTopCategoryMatches(categories, queryParts, limit = 5) {
  return categories
    .map((category) => ({
      category,
      score: scoreCategory(category, queryParts),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.category.categoryCode.localeCompare(right.category.categoryCode))
    .slice(0, limit);
}

module.exports = {
  findTopCategoryMatches,
};
