const path = require('path');
const XLSX = require('@e965/xlsx');

const ENGLISH_FILE = path.resolve(__dirname, '..', '..', 'Taxonomy Cemex', 'Taxonomy Cemex a 26 Jun COPILOT INGLES.xlsx');
const SPANISH_FILE = path.resolve(__dirname, '..', '..', 'Taxonomy Cemex', 'Taxonomy Cemex a 26 Jun COPILOT ESPAÑOL.xlsx');

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeMandatory(value) {
  if (value === 1 || value === '1') {
    return true;
  }

  return false;
}

function getColumnIndexes(headerValues) {
  const indexes = {};

  headerValues.forEach((value, index) => {
    indexes[normalizeHeader(value)] = index;
  });

  return {
    categoryCode: indexes['category code'],
    categoryName: indexes['category name'],
    categoryDefinition: indexes['category definition'],
    attributeCode: indexes['attribute code'],
    attributeShortDescription: indexes['attribute short description'],
    attributeDefinition: indexes['attributte definition'],
    mandatory: indexes['mandatory'],
    sequence: indexes['sequence'],
  };
}

function getCell(row, index) {
  if (typeof index !== 'number') {
    return '';
  }

  return row[index];
}

function mapSheetRows(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const columns = getColumnIndexes(rows[0] || []);

  return rows.slice(1).reduce((result, row) => {
    const categoryCode = normalizeText(getCell(row, columns.categoryCode));

    if (!categoryCode) {
      return result;
    }

    result.push({
      categoryCode,
      categoryName: normalizeText(getCell(row, columns.categoryName)),
      categoryDefinition: normalizeText(getCell(row, columns.categoryDefinition)),
      attributeCode: normalizeText(getCell(row, columns.attributeCode)),
      attributeShortDescription: normalizeText(getCell(row, columns.attributeShortDescription)),
      attributeDefinition: normalizeText(getCell(row, columns.attributeDefinition)),
      mandatory: normalizeMandatory(getCell(row, columns.mandatory)),
      sequence: Number(getCell(row, columns.sequence) || 0),
    });

    return result;
  }, []);
}

async function readWorksheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const firstSheetName = workbook.SheetNames[0];
  return mapSheetRows(workbook.Sheets[firstSheetName]);
}

function mergeTaxonomyRows(spanishRows, englishRows) {
  const categories = new Map();

  for (const row of spanishRows) {
    categories.set(row.categoryCode, {
      categoryCode: row.categoryCode,
      nameEs: row.categoryName,
      nameEn: '',
      definitionEs: row.categoryDefinition,
      definitionEn: '',
      attributes: [],
      searchTokens: [row.categoryCode, row.categoryName, row.categoryDefinition],
    });
  }

  for (const row of englishRows) {
    const existing = categories.get(row.categoryCode) || {
      categoryCode: row.categoryCode,
      nameEs: '',
      nameEn: '',
      definitionEs: '',
      definitionEn: '',
      attributes: [],
      searchTokens: [row.categoryCode],
    };

    existing.nameEn = row.categoryName;
    existing.definitionEn = row.categoryDefinition;
    existing.searchTokens.push(row.categoryName, row.categoryDefinition);
    categories.set(row.categoryCode, existing);
  }

  const englishAttributesByCategory = new Map();

  for (const row of englishRows) {
    const key = `${row.categoryCode}:${row.attributeCode}:${row.sequence}`;
    englishAttributesByCategory.set(key, row);
  }

  for (const row of spanishRows) {
    const key = `${row.categoryCode}:${row.attributeCode}:${row.sequence}`;
    const englishRow = englishAttributesByCategory.get(key);
    const category = categories.get(row.categoryCode);

    category.attributes.push({
      code: row.attributeCode,
      shortEs: row.attributeShortDescription,
      shortEn: englishRow ? englishRow.attributeShortDescription : '',
      definitionEs: row.attributeDefinition,
      definitionEn: englishRow ? englishRow.attributeDefinition : '',
      mandatory: row.mandatory,
      sequence: row.sequence,
    });
    category.searchTokens.push(
      row.attributeCode,
      row.attributeShortDescription,
      row.attributeDefinition,
      englishRow ? englishRow.attributeShortDescription : '',
      englishRow ? englishRow.attributeDefinition : ''
    );
  }

  return Array.from(categories.values())
    .map((category) => ({
      ...category,
      searchTokens: category.searchTokens.filter(Boolean),
      attributes: category.attributes.sort((left, right) => left.sequence - right.sequence),
    }))
    .sort((left, right) => left.categoryCode.localeCompare(right.categoryCode));
}

let taxonomyCache = null;

async function loadTaxonomy() {
  if (taxonomyCache) {
    return taxonomyCache;
  }

  const [spanishRows, englishRows] = await Promise.all([
    readWorksheet(SPANISH_FILE),
    readWorksheet(ENGLISH_FILE),
  ]);

  taxonomyCache = mergeTaxonomyRows(spanishRows, englishRows);
  return taxonomyCache;
}

module.exports = {
  loadTaxonomy,
};
