const path = require('path');
const express = require('express');
const { loadTaxonomy } = require('./taxonomyLoader');
const { classifyMaterial } = require('./orchestrator');
const { readTextFile } = require('./fileTextExtractor');

const app = express();
const PORT = Number(process.env.PORT || 3100);
const HOST = '127.0.0.1';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.resolve(__dirname, '..', 'public')));

app.get('/health', async (req, res) => {
  const taxonomy = await loadTaxonomy();
  res.json({
    status: 'ok',
    categories: taxonomy.length,
  });
});

app.post('/classify', async (req, res) => {
  const { description, manufacturer, partNumber, userInterpretation, imageFindings, file } = req.body || {};
  const normalizedDescription = typeof description === 'string' ? description.trim() : '';
  const normalizedPartNumber = typeof partNumber === 'string' ? partNumber.trim() : '';
  const fileText = await readTextFile(file && file.name, file && file.contentBase64);

  if (!normalizedDescription && !normalizedPartNumber && !fileText) {
    res.status(400).json({
      error: 'Invalid request',
      message: 'Debes enviar description, partNumber o un archivo .txt con contenido.',
    });
    return;
  }

  const result = await classifyMaterial({
    description: normalizedDescription,
    manufacturer,
    partNumber: normalizedPartNumber,
    userInterpretation,
    imageFindings,
    fileText,
  });

  res.json(result);
});

async function start() {
  await loadTaxonomy();

  app.listen(PORT, HOST, () => {
    console.log(`Catalog chatbot API listening on http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start catalog chatbot API');
  console.error(error);
  process.exit(1);
});
