'use strict';

const {
  createWorkspaceScanner,
  isSupportedFile,
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS,
  normalizeExtensions
} = require('../../../tsnjs/core/createWorkspaceScanner');
const { createTsLanguageProvider } = require('../../../tsnjs/languages/typescript/TsLanguageProvider');

const languageProvider = createTsLanguageProvider();
const { scanWorkspace } = createWorkspaceScanner(languageProvider);

function isTypeScriptFile(filePath, extensions) {
  const normalized = normalizeExtensions(extensions, languageProvider.getSupportedExtensions());
  return isSupportedFile(filePath, normalized);
}

module.exports = {
  scanWorkspace,
  isTypeScriptFile,
  DEFAULT_EXTENSIONS: languageProvider.getSupportedExtensions(),
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS
};
