'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_EXCLUDES = Object.freeze([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  'coverage',
  'dist',
  'build',
  'tmp',
  'logs'
]);
const DEPRECATED_PATH_FRAGMENTS = Object.freeze([
  'deprecated-ui',
  'deprecated-ui-root'
]);
const GENERATED_PATH_FRAGMENTS = Object.freeze([
  'public/assets',
  'screenshots'
]);

function normalizeExtensions(extensions, fallback = ['.js']) {
  if (!Array.isArray(extensions) || extensions.length === 0) {
    return fallback.slice();
  }
  return extensions.map((ext) => {
    if (typeof ext !== 'string' || ext.length === 0) {
      return null;
    }
    const trimmed = ext.trim();
    if (trimmed.startsWith('.')) {
      return trimmed.toLowerCase();
    }
    return `.${trimmed.toLowerCase()}`;
  }).filter(Boolean);
}

function isSupportedFile(filePath, extensions) {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.includes(ext);
}

function shouldExclude(relativePath, excludes) {
  if (!relativePath) {
    return false;
  }
  const segments = relativePath.split(/\\|\//);
  return excludes.some((pattern) => segments.includes(pattern) || relativePath.includes(pattern));
}

function isDeprecatedPath(relativePath) {
  if (!relativePath) {
    return false;
  }
  return DEPRECATED_PATH_FRAGMENTS.some((fragment) => relativePath.split(/\//).includes(fragment));
}

function sanitizeModuleSpecifier(specifier) {
  if (typeof specifier !== 'string') {
    return '';
  }
  const trimmed = specifier.trim();
  if (!trimmed) {
    return '';
  }
  if (/^(?:node:|https?:|data:|fs:)/i.test(trimmed)) {
    return '';
  }
  if (trimmed.includes('!')) {
    return '';
  }
  return trimmed.split('?')[0].split('#')[0];
}

function resolveBasePath(currentFile, specifier, rootDir) {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return path.resolve(path.dirname(currentFile), specifier);
  }

  if (specifier.startsWith('/')) {
    return path.resolve(rootDir, specifier.slice(1));
  }

  return null;
}

function expandToFileCandidates(basePath, extensions) {
  const queue = [basePath];
  const discovered = new Set();
  const results = new Set();

  if (!path.extname(basePath)) {
    extensions.forEach((ext) => {
      queue.push(`${basePath}${ext}`);
    });
  }

  while (queue.length > 0) {
    const candidate = queue.shift();
    const normalized = path.resolve(candidate);

    if (discovered.has(normalized)) {
      continue;
    }
    discovered.add(normalized);

    let stats;
    try {
      stats = fs.statSync(normalized);
    } catch (error) {
      continue;
    }

    if (stats.isFile()) {
      if (extensions.some((ext) => normalized.endsWith(ext))) {
        results.add(normalized);
      }
      continue;
    }

    if (stats.isDirectory()) {
      extensions.forEach((ext) => {
        if (!ext.startsWith('/index')) {
          queue.push(path.join(normalized, `index${ext}`));
        }
      });
    }
  }

  return Array.from(results);
}

function defaultResolveDependencyCandidates(filePath, specifier, context) {
  const sanitized = sanitizeModuleSpecifier(specifier);
  if (!sanitized) {
    return [];
  }

  const basePath = resolveBasePath(filePath, sanitized, context.rootDir);
  if (!basePath) {
    return [];
  }

  return expandToFileCandidates(basePath, context.candidateExtensions);
}

function createWorkspaceScanner(languageProvider, globalOptions = {}) {
  if (!languageProvider) {
    throw new Error('createWorkspaceScanner requires a language provider');
  }

  const provider = languageProvider;
  const providerExtensions = normalizeExtensions(provider.getSupportedExtensions(), ['.js']);
  const generatedFragments = Array.isArray(globalOptions.generatedFragments) && globalOptions.generatedFragments.length > 0
    ? globalOptions.generatedFragments
    : GENERATED_PATH_FRAGMENTS;

  function walkDirectory(rootDir, options, results) {
    const { excludes, extensions, followSymlinks, deprecatedOnly } = options;
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      const relativePath = results.rootRelative(fullPath);
      const entryIsDeprecated = isDeprecatedPath(relativePath);

      if (entry.isSymbolicLink() && followSymlinks !== true) {
        continue;
      }

      if (entry.isDirectory()) {
        if (shouldExclude(relativePath, excludes)) {
          continue;
        }

        if (deprecatedOnly && !entryIsDeprecated) {
          continue;
        }

        walkDirectory(fullPath, options, results);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (shouldExclude(relativePath, excludes)) {
        continue;
      }

      if (deprecatedOnly && !entryIsDeprecated) {
        continue;
      }

      if (!isSupportedFile(fullPath, extensions)) {
        continue;
      }

      results.files.push(fullPath);
    }
  }

  function resolveDependencyCandidates(filePath, specifier, context) {
    if (typeof provider.resolveDependencyCandidates === 'function') {
      return provider.resolveDependencyCandidates(filePath, specifier, {
        ...context,
        defaultResolver: (fp, spec, ctx) => defaultResolveDependencyCandidates(fp, spec, ctx)
      });
    }
    return defaultResolveDependencyCandidates(filePath, specifier, context);
  }

  function scanWorkspace(options = {}) {
    const rootDir = path.resolve(options.rootDir || options.dir || process.cwd());
    const includeDeprecated = options.includeDeprecated === true || options.deprecatedOnly === true;
    const deprecatedOnly = options.deprecatedOnly === true;
    const followDependencies = options.followDependencies === true;
    const dependencyDepthLimit = typeof options.dependencyDepth === 'number' && options.dependencyDepth > 0
      ? options.dependencyDepth
      : Infinity;
    const excludePatterns = new Set(DEFAULT_EXCLUDES);
    generatedFragments.forEach((fragment) => excludePatterns.add(fragment));
    if (Array.isArray(options.exclude)) {
      options.exclude.forEach((pattern) => excludePatterns.add(pattern));
    }
    if (!includeDeprecated) {
      DEPRECATED_PATH_FRAGMENTS.forEach((fragment) => excludePatterns.add(fragment));
    }
    const excludes = Array.from(excludePatterns);
    const normalizedExtensions = normalizeExtensions(options.extensions, providerExtensions);
    const candidateExtensions = Array.isArray(options.candidateExtensions) && options.candidateExtensions.length > 0
      ? options.candidateExtensions
      : (typeof provider.resolveCandidateExtensions === 'function'
        ? provider.resolveCandidateExtensions()
        : normalizedExtensions);

    const followSymlinks = Boolean(options.followSymlinks);

    const rootRelative = (filePath) => path.relative(rootDir, filePath).replace(/\\/g, '/');
    const collectedFiles = [];
    const stats = {
      scannedFiles: 0,
      parsedFiles: 0,
      functions: 0,
      classes: 0
    };
    const parseErrors = [];

    if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
      throw new Error(`Directory not found: ${rootDir}`);
    }

    walkDirectory(rootDir, { excludes, extensions: normalizedExtensions, followSymlinks, deprecatedOnly }, { files: collectedFiles, rootRelative });

    const pending = collectedFiles.map((filePath) => ({ filePath: path.resolve(filePath), depth: 0 }));
    const queuedPaths = new Set(pending.map((entry) => entry.filePath));
    const visitedPaths = new Set();
    const fileRecords = [];

    while (pending.length > 0) {
      const current = pending.shift();
      const absolutePath = current.filePath;

      if (visitedPaths.has(absolutePath)) {
        continue;
      }
      visitedPaths.add(absolutePath);

      stats.scannedFiles += 1;

      let source;
      try {
        source = fs.readFileSync(absolutePath, 'utf8');
      } catch (error) {
        parseErrors.push({ filePath: absolutePath, error });
        continue;
      }

      let ast;
      let collectResult;
      try {
        ast = provider.parseSource(source, path.basename(absolutePath));
        collectResult = provider.collectFunctions(ast, source);
      } catch (error) {
        parseErrors.push({ filePath: absolutePath, error });
        continue;
      }

      let record;
      try {
        record = provider.buildFileRecord({
          filePath: absolutePath,
          rootDir,
          source,
          ast,
          functions: collectResult.functions,
          mapper: collectResult.mapper
        });
        fileRecords.push(record);
        stats.parsedFiles += 1;
        stats.functions += record.stats.functions;
        stats.classes += record.stats.classes;
      } catch (error) {
        parseErrors.push({ filePath: absolutePath, error });
        continue;
      }

      const resolvedImports = new Set();
      const resolvedRequires = new Set();
      const resolvedAbsolutePaths = new Set();

      const collectResolvedTargets = (specifiers, kind) => {
        if (!Array.isArray(specifiers) || specifiers.length === 0) {
          return;
        }

        specifiers.forEach((specifier) => {
          const resolvedPaths = resolveDependencyCandidates(absolutePath, specifier, {
            rootDir,
            candidateExtensions,
            excludes,
            deprecatedOnly
          });

          resolvedPaths.forEach((resolvedPath) => {
            const normalizedPath = path.resolve(resolvedPath);
            const relativePath = rootRelative(normalizedPath);
            if (shouldExclude(relativePath, excludes)) {
              return;
            }

            if (deprecatedOnly && !isDeprecatedPath(relativePath)) {
              return;
            }

            if (!candidateExtensions.some((ext) => normalizedPath.endsWith(ext))) {
              return;
            }

            resolvedAbsolutePaths.add(normalizedPath);
            if (kind === 'imports') {
              resolvedImports.add(relativePath);
            } else {
              resolvedRequires.add(relativePath);
            }
          });
        });
      };

      if (record.dependencies) {
        collectResolvedTargets(record.dependencies.imports, 'imports');
        collectResolvedTargets(record.dependencies.requires, 'requires');
      }

      record.resolvedDependencies = {
        imports: Array.from(resolvedImports).sort(),
        requires: Array.from(resolvedRequires).sort()
      };

      if (!followDependencies) {
        continue;
      }

      if (current.depth >= dependencyDepthLimit) {
        continue;
      }

      resolvedAbsolutePaths.forEach((normalizedPath) => {
        if (visitedPaths.has(normalizedPath) || queuedPaths.has(normalizedPath)) {
          return;
        }

        const relativePath = rootRelative(normalizedPath);
        if (shouldExclude(relativePath, excludes)) {
          return;
        }

        if (deprecatedOnly && !isDeprecatedPath(relativePath)) {
          return;
        }

        if (!candidateExtensions.some((ext) => normalizedPath.endsWith(ext))) {
          return;
        }

        queuedPaths.add(normalizedPath);
        pending.push({ filePath: normalizedPath, depth: current.depth + 1 });
      });
    }

    return {
      rootDir,
      files: fileRecords,
      stats,
      errors: parseErrors
    };
  }

  return {
    scanWorkspace
  };
}

module.exports = {
  createWorkspaceScanner,
  isSupportedFile,
  normalizeExtensions,
  DEFAULT_EXCLUDES,
  DEPRECATED_PATH_FRAGMENTS,
  GENERATED_PATH_FRAGMENTS
};
