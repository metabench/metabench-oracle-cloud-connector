#!/usr/bin/env node
'use strict';

if (!process.env.TSNJS_EDIT_LANGUAGE) {
  process.env.TSNJS_EDIT_LANGUAGE = 'typescript';
}
if (!process.env.TSNJS_EDIT_COMMAND) {
  process.env.TSNJS_EDIT_COMMAND = 'ts-edit';
}

require('./js-edit.js');
