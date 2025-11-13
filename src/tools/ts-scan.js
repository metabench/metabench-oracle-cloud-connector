#!/usr/bin/env node
'use strict';

if (!process.env.TSNJS_SCAN_LANGUAGE) {
  process.env.TSNJS_SCAN_LANGUAGE = 'typescript';
}
if (!process.env.TSNJS_SCAN_COMMAND) {
  process.env.TSNJS_SCAN_COMMAND = 'ts-scan';
}

require('./js-scan.js');
