'use strict';

const { resolveLanguageContext, translateLabelWithMode, joinTranslatedLabels } = require('../../i18n/helpers');

function ensureFormatter(formatter) {
  if (!formatter || typeof formatter !== 'object') {
    throw new Error('cliReporting helpers require a formatter instance');
  }
  return formatter;
}

function formatDependencyRows(formatter, rows, showVia) {
  const fmt = ensureFormatter(formatter);
  const entries = Array.isArray(rows) ? rows : [];
  return entries.map((entry, index) => {
    const item = entry || {};
    const display = {
      '#': String(index + 1),
      File: item.exists ? fmt.COLORS.cyan(item.file) : fmt.COLORS.muted(item.file),
      Imports: item.importCount > 0 ? fmt.COLORS.success(String(item.importCount)) : '',
      Requires: item.requireCount > 0 ? fmt.COLORS.accent(String(item.requireCount)) : '',
      Hop: item.hop > 1 ? fmt.COLORS.muted(String(item.hop)) : '1'
    };
    if (showVia) {
      display.Via = item.via ? fmt.COLORS.muted(item.via) : '';
    }
    return display;
  });
}

function printDependencySummary(formatter, result) {
  const fmt = ensureFormatter(formatter);
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = translateLabelWithMode(fmt, language, 'dependencies', 'Dependencies');
  fmt.header(headerLabel);

  const targetLabel = translateLabelWithMode(fmt, language, 'target', 'Target');
  const target = result && result.target ? result.target : {};
  const file = target.file || '';
  const fileDisplay = target.exists ? fmt.COLORS.bold(fmt.COLORS.cyan(file)) : fmt.COLORS.muted(file);
  const matchedSuffix = target.matchedBy ? fmt.COLORS.muted(` (${target.matchedBy})`) : '';
  console.log(`  ${targetLabel}: ${fileDisplay}${matchedSuffix}`.trimEnd());

  if (target.function) {
    const func = target.function;
    const funcLabel = translateLabelWithMode(fmt, language, 'function', 'Function');
    const hashDisplay = func.hash ? fmt.COLORS.accent(`#${func.hash}`) : '';
    console.log(`  ${funcLabel}: ${fmt.COLORS.bold(func.name || '(anonymous)')} ${hashDisplay}`.trim());
  }

  const fanOutLabel = translateLabelWithMode(fmt, language, 'fan_out', 'Fan-out');
  const fanInLabel = translateLabelWithMode(fmt, language, 'fan_in', 'Fan-in');
  const stats = result && result.stats ? result.stats : {};
  fmt.stat(fanOutLabel, stats.fanOut, 'number');
  fmt.stat(fanInLabel, stats.fanIn, 'number');

  const depthValue = stats.depth === 0
    ? (isChinese ? '无限' : 'unbounded')
    : stats.depth;
  const limitValue = stats.limit === 0
    ? (isChinese ? '无限' : 'unlimited')
    : stats.limit;
  fmt.stat(translateLabelWithMode(fmt, language, 'depth', 'Depth'), depthValue);
  fmt.stat(translateLabelWithMode(fmt, language, 'limit', 'Limit'), limitValue);

  const outgoingEntries = Array.isArray(result && result.outgoing) ? result.outgoing : [];
  const showViaOutgoing = outgoingEntries.some((entry) => entry.hop > 1 && entry.via);
  const outgoingColumns = showViaOutgoing
    ? ['#', 'File', 'Via', 'Imports', 'Requires', 'Hop']
    : ['#', 'File', 'Imports', 'Requires', 'Hop'];

  const outgoingLabel = translateLabelWithMode(fmt, language, 'imports', 'Imports');
  fmt.section(`${outgoingLabel} (${outgoingEntries.length})`);
  if (outgoingEntries.length === 0) {
    const noneMessage = isChinese ? '无导入文件。' : 'No imports discovered for this file.';
    fmt.warn(noneMessage);
  } else {
    fmt.table(formatDependencyRows(fmt, outgoingEntries, showViaOutgoing), { columns: outgoingColumns });
  }

  const incomingEntries = Array.isArray(result && result.incoming) ? result.incoming : [];
  const showViaIncoming = incomingEntries.some((entry) => entry.hop > 1 && entry.via);
  const incomingColumns = showViaIncoming
    ? ['#', 'File', 'Via', 'Imports', 'Requires', 'Hop']
    : ['#', 'File', 'Imports', 'Requires', 'Hop'];

  const dependentsLabel = translateLabelWithMode(fmt, language, 'dependents', 'Dependents');
  fmt.section(`${dependentsLabel} (${incomingEntries.length})`);
  if (incomingEntries.length === 0) {
    const noneMessage = isChinese
      ? '无文件依赖此模块。考虑检查同级目录或入口文件。'
      : 'No files import this module. Consider reviewing sibling directories or entry points.';
    fmt.info(noneMessage);
  } else {
    fmt.table(formatDependencyRows(fmt, incomingEntries, showViaIncoming), { columns: incomingColumns });
  }

  fmt.footer();
}

function printParseErrorSummary(formatter, errors, options = {}) {
  const fmt = ensureFormatter(formatter);
  const entries = Array.isArray(errors) ? errors : [];
  if (entries.length === 0) {
    return;
  }

  const suppressed = Boolean(options.suppressed);
  const showDetails = Boolean(options.showDetails);
  if (!suppressed && !showDetails) {
    return;
  }

  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;
  const countMessage = isChinese
    ? `${entries.length} \u4e2a\u6587\u4ef6\u65e0\u6cd5\u89e3\u6790\u3002`
    : `${entries.length} files could not be parsed.`;
  const hintFlag = typeof options.hintFlag === 'string' && options.hintFlag.trim().length > 0
    ? options.hintFlag.trim()
    : '--show-parse-errors';

  if (showDetails) {
    fmt.warn(countMessage);
    const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 5;
    const samples = entries.slice(0, limit);
    samples.forEach((entry) => {
      const filePath = entry && entry.filePath ? entry.filePath : 'unknown';
      const message = entry && entry.error && entry.error.message
        ? entry.error.message
        : String(entry && entry.error ? entry.error : 'Unknown error');
      fmt.info(`${filePath}: ${message}`);
    });
    if (entries.length > samples.length) {
      const extraMessage = isChinese
        ? `\u8fd8\u6709 ${entries.length - samples.length} \u4e2a\u9519\u8bef\u5df2\u7701\u7565\u3002`
        : `Additional ${entries.length - samples.length} errors omitted.`;
      fmt.info(extraMessage);
    }
    return;
  }

  if (!suppressed) {
    return;
  }

  const hint = isChinese
    ? `${countMessage} \u4f7f\u7528 ${hintFlag} \u67e5\u770b\u8be6\u60c5\u3002`
    : `${countMessage} Use ${hintFlag} for details.`;
  fmt.info(hint);
}

function printRippleAnalysis(formatter, result, options = {}) {
  const fmt = ensureFormatter(formatter);
  const language = resolveLanguageContext(fmt);
  const { isChinese } = language;

  const headerLabel = isChinese ? '纹波分析' : 'Ripple Analysis';
  fmt.header(headerLabel);

  if (!result || (!result.success && result.error)) {
    if (result && result.error) {
      fmt.error(result.error);
    }
    return;
  }

  console.log(`  ${fmt.COLORS.cyan(result.targetFile)}`);
  console.log();

  const graphLabel = isChinese ? '依赖图' : 'Dependency Graph';
  fmt.stat(graphLabel, '');
  fmt.stat('  Nodes', result.graph.nodeCount, 'number');
  fmt.stat('  Edges', result.graph.edgeCount, 'number');
  fmt.stat('  Depth', result.graph.depth, 'number');
  fmt.stat('  Has Cycles', result.graph.hasCycles ? fmt.COLORS.error('YES') : fmt.COLORS.success('NO'));
  console.log();

  const riskLabel = isChinese ? '风险评分' : 'Risk Assessment';
  fmt.stat(riskLabel, '');
  const riskColor = result.risk.level === 'GREEN'
    ? fmt.COLORS.success(result.risk.level)
    : result.risk.level === 'YELLOW'
      ? fmt.COLORS.accent(result.risk.level)
      : fmt.COLORS.error(result.risk.level);
  fmt.stat('  Level', riskColor);
  fmt.stat('  Score', `${result.risk.score}/100`, 'number');

  if (result.risk.factors) {
    fmt.stat('  Factors', '');
    Object.entries(result.risk.factors).forEach(([key, value]) => {
      fmt.stat(`    ${key}`, `${value}%`, 'number');
    });
  }
  console.log();

  const safetyLabel = isChinese ? '安全检查' : 'Safety Checks';
  fmt.stat(safetyLabel, '');
  const checks = [
    { name: 'Rename', value: result.safetyAssertions && result.safetyAssertions.canRename },
    { name: 'Delete', value: result.safetyAssertions && result.safetyAssertions.canDelete },
    { name: 'Modify Signature', value: result.safetyAssertions && result.safetyAssertions.canModifySignature },
    { name: 'Extract', value: result.safetyAssertions && result.safetyAssertions.canExtract }
  ];
  checks.forEach(({ name, value }) => {
    const status = value ? fmt.COLORS.success('✓') : fmt.COLORS.error('✗');
    fmt.stat(`  ${name}`, status);
  });
  console.log();

  if (result.risk.recommendations && result.risk.recommendations.length > 0) {
    const recLabel = isChinese ? '建议' : 'Recommendations';
    fmt.stat(recLabel, '');
    result.risk.recommendations.forEach((rec, idx) => {
      console.log(`  ${idx + 1}. ${rec}`);
    });
    console.log();
  }

  if (result.cycles && result.cycles.hasCycles && result.cycles.cycles.length > 0) {
    const cycleLabel = isChinese ? '循环依赖' : 'Circular Dependencies';
    fmt.stat(cycleLabel, `${result.cycles.cycleCount} found`);
    result.cycles.cycles.slice(0, 3).forEach((cycle, idx) => {
      const path = Array.isArray(cycle) ? cycle.join(' → ') : String(cycle);
      console.log(`  ${idx + 1}. ${path}`);
    });
    if (result.cycles.cycles.length > 3) {
      const omitted = result.cycles.cycles.length - 3;
      fmt.muted(`  ... and ${omitted} more`);
    }
    console.log();
  }

  fmt.footer();
}

function formatTerseMatch(match, fields, language, formatter) {
  const fmt = ensureFormatter(formatter);
  const isChinese = language && language.isChinese;
  const segments = [];

  let pendingLocation = null;

  const flushPendingLocation = () => {
    if (!pendingLocation) {
      return;
    }
    const parts = [];
    if (pendingLocation.file) {
      parts.push(fmt.COLORS.cyan(pendingLocation.file));
    }
    if (pendingLocation.line !== undefined && pendingLocation.line !== null) {
      parts.push(fmt.COLORS.muted(String(pendingLocation.line)));
    }
    if (pendingLocation.column !== undefined && pendingLocation.column !== null) {
      parts.push(fmt.COLORS.muted(String(pendingLocation.column)));
    }
    if (parts.length > 0) {
      segments.push(parts.join(':'));
    }
    pendingLocation = null;
  };

  const queueLocationPart = (part, value) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    if (!pendingLocation) {
      pendingLocation = { file: null, line: null, column: null };
    }
    pendingLocation[part] = value;
  };

  const directLocationString = () => {
    const parts = [];
    parts.push(fmt.COLORS.cyan(match.file));
    if (match.function.line !== undefined && match.function.line !== null) {
      parts.push(fmt.COLORS.muted(String(match.function.line)));
    }
    if (match.function.column !== undefined && match.function.column !== null) {
      parts.push(fmt.COLORS.muted(String(match.function.column)));
    }
    return parts.join(':');
  };

  fields.forEach((field) => {
    switch (field) {
      case 'location':
        flushPendingLocation();
        segments.push(directLocationString());
        break;
      case 'file':
        queueLocationPart('file', match.file);
        break;
      case 'line':
        queueLocationPart('line', match.function.line);
        break;
      case 'column':
        queueLocationPart('column', match.function.column);
        break;
      case 'name':
        flushPendingLocation();
        segments.push(fmt.COLORS.bold(match.function.name || '(anonymous)'));
        break;
      case 'canonical':
        flushPendingLocation();
        if (match.function.canonicalName) {
          segments.push(fmt.COLORS.muted(match.function.canonicalName));
        }
        break;
      case 'kind':
        flushPendingLocation();
        if (match.function.kind) {
          segments.push(fmt.COLORS.muted(match.function.kind));
        }
        break;
      case 'hash':
        flushPendingLocation();
        if (match.function.hash) {
          segments.push(fmt.COLORS.accent(`#${match.function.hash}`));
        }
        break;
      case 'rank':
        flushPendingLocation();
        {
          const stars = match.rank > 0 ? '★'.repeat(match.rank) : '·';
          segments.push(fmt.COLORS.accent(stars));
        }
        break;
      case 'score':
        flushPendingLocation();
        if (typeof match.score === 'number') {
          segments.push(fmt.COLORS.accent(match.score.toFixed(2)));
        }
        break;
      case 'exported':
        flushPendingLocation();
        {
          const label = match.function.exported
            ? (isChinese ? '出' : 'exp')
            : (isChinese ? '内' : 'int');
          const color = match.function.exported ? fmt.COLORS.success : fmt.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'async':
        flushPendingLocation();
        {
          const isAsync = Boolean(match.function.isAsync);
          const label = isAsync ? (isChinese ? '异' : 'async') : (isChinese ? '常' : 'sync');
          const color = isAsync ? fmt.COLORS.cyan : fmt.COLORS.muted;
          segments.push(color(label));
        }
        break;
      case 'generator':
        flushPendingLocation();
        if (match.function.isGenerator) {
          segments.push(fmt.COLORS.cyan(isChinese ? '生' : 'gen'));
        }
        break;
      case 'terms':
        flushPendingLocation();
        {
          const terms = Array.isArray(match.context.matchTerms) ? match.context.matchTerms : [];
          const rendered = terms.length > 0 ? terms.join('/') : '-';
          segments.push(fmt.COLORS.muted(`~${rendered}`));
        }
        break;
      default:
        break;
    }
  });

  flushPendingLocation();

  return segments;
}

function printSearchSummary(formatter, result, options, language, limitDisplay) {
  const fmt = ensureFormatter(formatter);
  const { isChinese } = language;
  const headerLabel = translateLabelWithMode(fmt, language, 'search', 'Search');
  console.log(fmt.COLORS.bold(fmt.COLORS.accent(headerLabel)));

  const segments = isChinese
    ? [
        `${translateLabelWithMode(fmt, language, 'match_count', 'matches')}:${result.stats.matchCount}`,
        `${translateLabelWithMode(fmt, language, 'list', 'shown')}:${result.matches.length}`,
        `${translateLabelWithMode(fmt, language, 'search_limit', 'limit')}:${limitDisplay}`,
        `${translateLabelWithMode(fmt, language, 'exports', 'exported')}:${result.stats.exportedMatches}`,
        `${translateLabelWithMode(fmt, language, 'async', 'async')}:${result.stats.asyncMatches}`,
        `${translateLabelWithMode(fmt, language, 'files_total', 'files')}:${result.stats.filesConsidered}`
      ]
    : [
        `matches=${result.stats.matchCount}`,
        `shown=${result.matches.length}`,
        `limit=${limitDisplay}`,
        `exported=${result.stats.exportedMatches}`,
        `async=${result.stats.asyncMatches}`,
        `files=${result.stats.filesConsidered}`
      ];

  console.log(fmt.COLORS.muted(segments.join(' ')));

  if (Array.isArray(result.terms) && result.terms.length > 0) {
    const termsLabel = isChinese
      ? `${translateLabelWithMode(fmt, language, 'search_text', 'terms')}:`
      : 'terms=';
    console.log(fmt.COLORS.muted(`${termsLabel}${result.terms.join(',')}`));
  }

  if (result.matches.length === 0) {
    fmt.warn(isChinese ? '无匹' : 'No matches found.');
  } else {
    const top = result.matches[0];
    const locationLabel = translateLabelWithMode(fmt, language, 'location', 'location');
    console.log(fmt.COLORS.muted(`${locationLabel}:${top.file}:${top.function.line}`));
  }

  if (result.guidance && result.guidance.triggered && !options.noGuidance) {
    const guidanceLabel = translateLabelWithMode(fmt, language, 'guidance', 'Guidance');
    result.guidance.suggestions.forEach((suggestion) => {
      const suggestionText = isChinese
        ? `${guidanceLabel}:${suggestion.example}`
        : `${suggestion.rationale} ${fmt.COLORS.accent(suggestion.example)}`;
      fmt.info(suggestionText);
    });
  }
}

module.exports = {
  formatDependencyRows,
  printDependencySummary,
  printParseErrorSummary,
  printRippleAnalysis,
  formatTerseMatch,
  printSearchSummary
};
