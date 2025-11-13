'use strict';

/**
 * Markdown AST utilities using markdown-it
 * Provides section extraction, hashing, and manipulation
 */

const crypto = require('crypto');
const MarkdownIt = require('markdown-it');
const { HASH_PRIMARY_ENCODING, normalizeHashEncoding, encodeHash } = require('../shared/hashConfig');

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false
});

/**
 * Parse markdown source into AST with position tracking
 */
function parseMarkdown(source) {
  const tokens = md.parse(source, {});
  return { tokens, source };
}

/**
 * Collect all sections (headings) with their content boundaries
 */
function collectSections(ast, source) {
  const { tokens } = ast;
  const sections = [];
  const lines = source.split('\n');

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'heading_open') {
      const level = parseInt(token.tag.substring(1), 10);
      const contentToken = tokens[i + 1];
      const closeToken = tokens[i + 2];

      if (!contentToken || contentToken.type !== 'inline') {
        continue;
      }

      const heading = contentToken.content;
      const startLine = token.map ? token.map[0] : 0;
      
      // Find end of section (next heading of same or higher level, or EOF)
      let endLine = lines.length;
      for (let j = i + 3; j < tokens.length; j++) {
        const nextToken = tokens[j];
        if (nextToken.type === 'heading_open') {
          const nextLevel = parseInt(nextToken.tag.substring(1), 10);
          if (nextLevel <= level) {
            endLine = nextToken.map ? nextToken.map[0] : endLine;
            break;
          }
        }
      }

      const content = lines.slice(startLine, endLine).join('\n');
      const hash = createSectionHash(heading, content);

      sections.push({
        level,
        heading,
        startLine,
        endLine,
        lineCount: endLine - startLine,
        content,
        hash,
        slug: slugify(heading)
      });
    }
  }

  return sections;
}

/**
 * Collect all code blocks with metadata
 */
function collectCodeBlocks(ast) {
  const { tokens } = ast;
  const blocks = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'fence' || token.type === 'code_block') {
      const language = token.info || 'text';
      const startLine = token.map ? token.map[0] : 0;
      const endLine = token.map ? token.map[1] : 0;
      const lineCount = endLine - startLine;

      blocks.push({
        language,
        startLine,
        endLine,
        lineCount,
        content: token.content,
        inline: token.type === 'code_inline'
      });
    }
  }

  return blocks;
}

/**
 * Extract a specific section by selector (heading text, slug, or hash)
 */
function extractSection(sections, selector) {
  const matches = findSections(sections, selector);
  
  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    return { multipleMatches: true, matches };
  }

  return matches[0];
}

/**
 * Remove a section from source
 */
function removeSection(source, section) {
  const lines = source.split('\n');
  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine);
  
  return before.concat(after).join('\n');
}

/**
 * Replace a section's content
 */
function replaceSection(source, section, newContent) {
  const lines = source.split('\n');
  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine);
  
  // Preserve the heading line
  const headingLine = lines[section.startLine];
  const contentLines = newContent.split('\n');
  
  return before
    .concat([headingLine])
    .concat(contentLines)
    .concat(after)
    .join('\n');
}

/**
 * Find sections matching a selector
 */
function findSections(sections, selector) {
  if (!selector) {
    return [];
  }

  const selectorString = typeof selector === 'string' ? selector : String(selector);
  const trimmed = selectorString.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const stripOuterQuotes = (value) => {
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
        return value.slice(1, -1);
      }
    }
    return value;
  };

  const prefixMatch = trimmed.match(/^(hash|section[-_]?hash)\s*[:=]\s*(.+)$/i);
  const baseValue = prefixMatch ? prefixMatch[2] : trimmed;
  const normalizedValue = stripOuterQuotes(baseValue.trim());

  if (normalizedValue.length === 0) {
    return [];
  }

  let matches = sections.filter((section) => section.heading === normalizedValue);
  if (matches.length > 0) {
    return matches;
  }

  matches = sections.filter((section) => section.slug === normalizedValue);
  if (matches.length > 0) {
    return matches;
  }

  const hashCandidates = new Set([normalizedValue]);

  const addCanonicalHex = (hexValue) => {
    if (!/^[0-9a-f]+$/i.test(hexValue) || hexValue.length % 2 !== 0) {
      return;
    }
    try {
      const buffer = Buffer.from(hexValue, 'hex');
      if (buffer.length > 0) {
        hashCandidates.add(encodeHash(buffer, 'base64'));
      }
    } catch (error) {
      // ignore invalid hex payloads
    }
  };

  const addCanonicalBase64 = (base64Value) => {
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Value)) {
      return;
    }
    try {
      const buffer = Buffer.from(base64Value, 'base64');
      if (buffer.length > 0) {
        hashCandidates.add(encodeHash(buffer, 'base64'));
      }
    } catch (error) {
      // ignore invalid base64 payloads
    }
  };

  addCanonicalHex(normalizedValue);
  addCanonicalBase64(normalizedValue);

  if (prefixMatch && prefixMatch[2]) {
    const explicit = stripOuterQuotes(prefixMatch[2].trim());
    if (explicit && explicit !== normalizedValue) {
      hashCandidates.add(explicit);
      addCanonicalHex(explicit);
      addCanonicalBase64(explicit);
    }
  }

  const hashMatches = sections.filter((section) => hashCandidates.has(section.hash));
  if (hashMatches.length > 0) {
    return hashMatches;
  }

  const lowerSelector = normalizedValue.toLowerCase();
  return sections.filter((section) =>
    section.heading.toLowerCase().includes(lowerSelector)
  );
}


/**
 * Create a hash for a section (heading + content)
 */
function createSectionHash(heading, content, encoding = HASH_PRIMARY_ENCODING) {
  const combined = `${heading}\n${content}`;
  const digestBuffer = crypto.createHash('sha256').update(combined, 'utf8').digest();
  return encodeHash(digestBuffer, normalizeHashEncoding(encoding));
}

/**
 * Convert heading to URL-friendly slug
 */
function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Compute markdown document statistics
 */
function computeMarkdownStats(source, sections, codeBlocks) {
  const lines = source.split('\n');
  const words = source.split(/\s+/).filter(w => w.length > 0);
  
  const codeLines = codeBlocks.reduce((sum, block) => sum + block.lineCount, 0);
  const proseLines = lines.length - codeLines;

  const sectionsByLevel = {};
  sections.forEach(s => {
    sectionsByLevel[s.level] = (sectionsByLevel[s.level] || 0) + 1;
  });

  return {
    totalLines: lines.length,
    proseLines,
    codeLines,
    totalWords: words.length,
    totalSections: sections.length,
    sectionsByLevel,
    codeBlocks: codeBlocks.length,
    avgSectionLength: sections.length > 0 
      ? Math.round(sections.reduce((sum, s) => sum + s.lineCount, 0) / sections.length)
      : 0
  };
}

/**
 * Filter sections by glob pattern
 */
function filterSectionsByPattern(sections, pattern, exclude = false) {
  if (!pattern) {
    return sections;
  }

  const regex = globToRegex(pattern);
  if (!regex) {
    return sections;
  }

  return sections.filter(s => {
    const matches = regex.test(s.heading);
    return exclude ? !matches : matches;
  });
}

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') {
    return null;
  }

  let regexStr = '^';
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === '*') {
      if (pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
      } else {
        regexStr += '[^/]*';
        i += 1;
      }
    } else if (char === '?') {
      regexStr += '.';
      i += 1;
    } else if ('.^$+{}[]()\\|'.includes(char)) {
      regexStr += '\\' + char;
      i += 1;
    } else {
      regexStr += char;
      i += 1;
    }
  }

  regexStr += '$';

  try {
    return new RegExp(regexStr, 'i');
  } catch (e) {
    return null;
  }
}

module.exports = {
  parseMarkdown,
  collectSections,
  collectCodeBlocks,
  extractSection,
  removeSection,
  replaceSection,
  findSections,
  createSectionHash,
  slugify,
  computeMarkdownStats,
  filterSectionsByPattern,
  globToRegex
};
