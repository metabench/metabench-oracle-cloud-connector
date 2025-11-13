'use strict';

const { LanguageProvider } = require('../../core/LanguageProvider');
const swcTs = require('../../../lib/swcTs');
const { createTsFileRecord } = require('../../../ts-scan/lib/fileContext');

const DEFAULT_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.cts', '.mts', '.d.ts']);

class TsLanguageProvider extends LanguageProvider {
  constructor(options = {}) {
    super({
      ...options,
      name: 'typescript',
      extensions: options.extensions || DEFAULT_EXTENSIONS
    });
  }

  parseSource(source, fileName) {
    const targetName = typeof fileName === 'string' && fileName.length > 0
      ? fileName
      : 'anonymous.ts';
    return swcTs.parseModule(source, targetName);
  }

  collectFunctions(ast, source, mapper) {
    return swcTs.collectFunctions(ast, source, mapper);
  }

  collectVariables(ast, source, mapper) {
    return swcTs.collectVariables(ast, source, mapper);
  }

  buildFileRecord({ filePath, rootDir, source, ast, functions, mapper }) {
    return createTsFileRecord({
      filePath,
      rootDir,
      source,
      ast,
      functions,
      mapper
    });
  }

  resolveCandidateExtensions() {
    return this.getSupportedExtensions();
  }
}

function createTsLanguageProvider(options = {}) {
  return new TsLanguageProvider(options);
}

module.exports = {
  TsLanguageProvider,
  createTsLanguageProvider,
  DEFAULT_EXTENSIONS
};
