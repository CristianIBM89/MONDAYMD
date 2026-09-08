const { SYSTEM_PROMPT } = require('./prompt');
const { loadTaxonomy } = require('./taxonomyLoader');
const { findTopCategoryMatches } = require('./taxonomySearch');
const { normalizeOfficialEvidence } = require('./officialLookupEvidence');

function extractPartNumber(input) {
  const text = String(input || '');
  const compoundMatch = text.match(/\b[A-Z0-9]+(?:[-/.][A-Z0-9]+)+\b/i);

  if (compoundMatch) {
    return compoundMatch[0];
  }

  const simpleMatch = text.match(/\b[A-Z0-9]{4,}\b/i);
  return simpleMatch ? simpleMatch[0] : '';
}

function buildAttributes(category) {
  return category.attributes.map((attribute) => ({
    code: attribute.code,
    nameEs: attribute.shortEs,
    nameEn: attribute.shortEn,
    mandatory: attribute.mandatory,
    definitionEs: attribute.definitionEs,
    definitionEn: attribute.definitionEn,
  }));
}

async function classifyMaterial(input) {
  const categories = await loadTaxonomy();
  const officialEvidence = normalizeOfficialEvidence(input.officialLookupEvidence);
  const partNumber = extractPartNumber([
    input.partNumber,
    officialEvidence && officialEvidence.partNumber,
    input.imageFindings && input.imageFindings.model,
    input.imageFindings && input.imageFindings.detectedText,
    input.description,
    input.fileText,
    officialEvidence && officialEvidence.evidenceText,
  ].filter(Boolean).join(' '));
  const matches = findTopCategoryMatches(categories, {
    description: input.description || '',
    manufacturer: input.manufacturer || (officialEvidence && officialEvidence.manufacturer) || '',
    partNumber,
    userInterpretation: input.userInterpretation || '',
    fileText: [
      input.fileText || '',
      officialEvidence && officialEvidence.materialType,
      officialEvidence && officialEvidence.evidenceText,
    ].filter(Boolean).join(' '),
  }, 5);

  if (matches.length === 0) {
    return {
      systemPrompt: SYSTEM_PROMPT,
      status: 'needs_more_information',
      message: 'No se encontró una categoría candidata con la evidencia proporcionada.',
      guidance: [
        'Comparte un número de parte exacto si lo tienes disponible.',
        'Adjunta un archivo .txt con la información técnica si no cuentas con fabricante.',
        'Incluye una descripción corta del material o equipo relacionado.',
      ],
    };
  }

  const bestMatch = matches[0].category;
  const manufacturer = input.manufacturer || (officialEvidence && officialEvidence.manufacturer) || (input.imageFindings && input.imageFindings.brand) || 'POR VALIDAR';
  const validationSource = officialEvidence
    ? 'taxonomy+official_lookup'
    : input.fileText
      ? 'taxonomy+archivo'
      : partNumber
        ? 'taxonomy+part_number'
        : 'taxonomy';

  return {
    systemPrompt: SYSTEM_PROMPT,
    status: 'classified',
    inputSummary: {
      description: input.description || '',
      userInterpretation: input.userInterpretation || '',
      manufacturer,
      extractedPartNumber: partNumber,
      fileTextUsed: Boolean(input.fileText),
      officialLookupEvidence: officialEvidence,
    },
    category: {
      code: bestMatch.categoryCode,
      nameEs: bestMatch.nameEs,
      nameEn: bestMatch.nameEn,
      definitionEs: bestMatch.definitionEs,
      definitionEn: bestMatch.definitionEn,
    },
    technicalAttributes: buildAttributes(bestMatch),
    exampleRecord: {
      PART: partNumber || 'POR VALIDAR',
      Fabricante: manufacturer,
      CategoriaES: bestMatch.nameEs,
      CategoriaEN: bestMatch.nameEn,
    },
    fillGuide: [
      `1. Identifica el número de parte exacto del fabricante y registra solo ese valor en PART: ${partNumber || 'POR VALIDAR'}.`,
      `2. Registra el fabricante bajo la estructura [P/N] | Fabricante: ${manufacturer}.`,
      `3. Usa el código de categoría ${bestMatch.categoryCode}.`,
      `4. Captura la categoría exacta en español: ${bestMatch.nameEs}.`,
      `5. Captura la categoría exacta en inglés: ${bestMatch.nameEn}.`,
      '6. Completa todos los atributos técnicos obligatorios antes de cerrar el registro.',
    ],
    candidateCategories: matches.map((item) => ({
      score: item.score,
      code: item.category.categoryCode,
      nameEs: item.category.nameEs,
      nameEn: item.category.nameEn,
    })),
    validation: {
      source: validationSource,
      confidence: matches.length > 1 && matches[0].score === matches[1].score ? 'media' : 'alta',
    },
  };
}

module.exports = {
  classifyMaterial,
};
