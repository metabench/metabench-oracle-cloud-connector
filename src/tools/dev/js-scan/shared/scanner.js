'use strict';

const {
  createWorkspaceScanner,
  isSupportedFile,
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS,
  normalizeExtensions
} = require('../../../tsnjs/core/createWorkspaceScanner');
const { createJsLanguageProvider } = require('../../../tsnjs/languages/javascript/JsLanguageProvider');
const { createTsLanguageProvider } = require('../../../tsnjs/languages/typescript/TsLanguageProvider');

const SCAN_LANGUAGE = process.env.TSNJS_SCAN_LANGUAGE === 'typescript' ? 'typescript' : 'javascript';
const languageProvider = SCAN_LANGUAGE === 'typescript'
  ? createTsLanguageProvider()
  : createJsLanguageProvider();
const { scanWorkspace } = createWorkspaceScanner(languageProvider);

function isSourceFile(filePath, extensions) {
  const normalized = normalizeExtensions(extensions, languageProvider.getSupportedExtensions());
  return isSupportedFile(filePath, normalized);
}

module.exports = {
  scanWorkspace,
  isJavaScriptFile: isSourceFile,
  isTypeScriptFile: isSourceFile,
  DEFAULT_EXTENSIONS: languageProvider.getSupportedExtensions(),
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS
};
