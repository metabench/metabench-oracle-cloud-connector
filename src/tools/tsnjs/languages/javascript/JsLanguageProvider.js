'use strict';

const path = require('path');
const { LanguageProvider } = require('../../core/LanguageProvider');
const {
  parseModule,
  collectFunctions,
  collectVariables
} = require('../../../lib/swcAst');
const { createFileRecord } = require('../../../dev/js-scan/lib/fileContext');


class JsLanguageProvider extends LanguageProvider {
  constructor(options = {}) {
    const defaultExtensions = ['.js', '.cjs', '.mjs', '.jsx'];
    super({
      ...options,
      name: 'javascript',
      extensions: options.extensions || defaultExtensions
    });
  }

  parseSource(source, fileName) {
    return parseModule(source, fileName || 'anonymous.js');
  }

  collectFunctions(ast, source, mapper) {
    return collectFunctions(ast, source, mapper);
  }

  collectVariables(ast, source, mapper) {
    return collectVariables(ast, source, mapper);
  }

  buildFileRecord({ filePath, rootDir, source, ast, functions, mapper }) {
    return createFileRecord({
      filePath,
      rootDir,
      source,
      ast,
      functions,
      mapper
    });
  }

  /**
   * Utility helper used by scanners to normalize extension lookups.
   */
  resolveCandidateExtensions() {
    const exts = this.getSupportedExtensions();
    return Array.isArray(exts) && exts.length > 0 ? exts : ['.js'];
  }

  /**
   * For now JavaScript uses the standard relative resolution rules.
   */
  resolveDependencyCandidates(filePath, specifier, context) { // eslint-disable-line class-methods-use-this
    return context.defaultResolver(filePath, specifier, context);
  }
}

function createJsLanguageProvider(options = {}) {
  return new JsLanguageProvider(options);
}

module.exports = {
  JsLanguageProvider,
  createJsLanguageProvider
};
