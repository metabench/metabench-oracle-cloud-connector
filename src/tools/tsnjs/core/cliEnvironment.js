'use strict';

const { setupPowerShellEncoding } = require('../../shared/powershellEncoding');
const { CliFormatter } = require('../../../util/CliFormatter');
const { translateCliArgs } = require('../../i18n/dialect');
const { extractLangOption, deriveLanguageModeHint } = require('../../i18n/language');

function createCliFormatter(options = {}) {
  const { Formatter = CliFormatter, enablePowerShellEncoding = true } = options;
  if (enablePowerShellEncoding) {
    setupPowerShellEncoding();
  }
  return new Formatter();
}

function prepareCliLanguage({ commandName, argv, formatter }) {
  if (typeof commandName !== 'string' || commandName.length === 0) {
    throw new Error('prepareCliLanguage requires a non-empty commandName');
  }
  const tokens = Array.isArray(argv) ? argv : process.argv.slice(2);
  const translation = translateCliArgs(commandName, tokens);
  const langOverride = extractLangOption(translation.argv);
  const languageHint = deriveLanguageModeHint(langOverride, translation);
  if (formatter && typeof formatter.setLanguageMode === 'function') {
    formatter.setLanguageMode(languageHint);
  }
  return {
    translation,
    langOverride,
    languageHint
  };
}

module.exports = {
  createCliFormatter,
  prepareCliLanguage
};
