const path = require('path');

async function readTextFile(fileName, contentBase64) {
  if (!fileName || !contentBase64) {
    return '';
  }

  if (path.extname(fileName).toLowerCase() !== '.txt') {
    return '';
  }

  return Buffer.from(contentBase64, 'base64').toString('utf8');
}

module.exports = {
  readTextFile,
};
