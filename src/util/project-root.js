'use strict';

const fs = require('fs');
const path = require('path');

function isReadableDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch (error) {
    return false;
  }
}

function hasProjectMarkers(candidate) {
  const packageJson = path.join(candidate, 'package.json');
  if (fs.existsSync(packageJson)) {
    return true;
  }
  const tsconfig = path.join(candidate, 'tsconfig.json');
  const gitDir = path.join(candidate, '.git');
  return fs.existsSync(tsconfig) || fs.existsSync(gitDir);
}

function findProjectRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);

  if (!isReadableDirectory(current)) {
    current = path.dirname(current);
  }

  let last = null;
  while (current !== last) {
    if (hasProjectMarkers(current)) {
      return current;
    }
    last = current;
    current = path.dirname(current);
  }

  return path.resolve(startDir);
}

module.exports = {
  findProjectRoot
};
