'use strict';

class LanguageProvider {
  constructor(options = {}) {
    this.name = options.name || 'unknown';
    this.extensions = Array.isArray(options.extensions) && options.extensions.length > 0
      ? options.extensions.map((ext) => typeof ext === 'string' ? ext.toLowerCase() : ext)
      : ['.js'];
  }

  /**
   * @returns {string[]} extensions that should be treated as primary sources.
   */
  getSupportedExtensions() {
    return this.extensions;
  }

  /**
   * Parse source text into an AST.
   * @abstract
   */
  parseSource(source, fileName) { // eslint-disable-line class-methods-use-this
    throw new Error('LanguageProvider.parseSource must be implemented by subclasses');
  }

  /**
   * Collect function metadata from an AST.
   * @abstract
   */
  collectFunctions(ast, source, mapper) { // eslint-disable-line class-methods-use-this
    throw new Error('LanguageProvider.collectFunctions must be implemented by subclasses');
  }

  /**
   * Collect variable metadata from an AST.
   * @abstract
   */
  collectVariables(ast, source, mapper) { // eslint-disable-line class-methods-use-this
    throw new Error('LanguageProvider.collectVariables must be implemented by subclasses');
  }

  /**
   * Build the file record consumed by higher-level tooling.
   * @abstract
   */
  buildFileRecord(context) { // eslint-disable-line class-methods-use-this
    throw new Error('LanguageProvider.buildFileRecord must be implemented by subclasses');
  }
}

module.exports = {
  LanguageProvider
};
