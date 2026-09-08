function normalizeOfficialEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return null;
  }

  const partNumber = typeof evidence.partNumber === 'string' ? evidence.partNumber.trim() : '';
  const manufacturer = typeof evidence.manufacturer === 'string' ? evidence.manufacturer.trim() : '';
  const materialType = typeof evidence.materialType === 'string' ? evidence.materialType.trim() : '';
  const evidenceText = typeof evidence.evidenceText === 'string' ? evidence.evidenceText.trim() : '';
  const sourceType = typeof evidence.sourceType === 'string' ? evidence.sourceType.trim() : '';
  const sourceUrl = typeof evidence.sourceUrl === 'string' ? evidence.sourceUrl.trim() : '';

  if (!partNumber && !manufacturer && !materialType && !evidenceText) {
    return null;
  }

  return {
    partNumber,
    manufacturer,
    materialType,
    evidenceText,
    sourceType,
    sourceUrl,
  };
}

module.exports = {
  normalizeOfficialEvidence,
};
