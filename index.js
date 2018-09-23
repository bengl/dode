#!/usr/bin/env node
'use strict';

const config = require('./lib/config.js');
const download = require('qdownload');
const { isdir, mkdirp, cpr } = require('qfastfs');
const fs = require('fs');
const util = require('util');

const isProd = config.production;

const useCache = !config.noCache;
const useDest = !config.cacheOnly;

if (fs.existsSync(`${process.cwd()}/node_modules`)) {
  console.error('Please delete your node_modules directory before installing.');
  process.exit(1);
}

let tree;
try {
  tree = require(`${process.cwd()}/package-lock.json`);
} catch (e) {
  if ('QDD_LOCKJS' in process.env) {
    const content = fs.readFileSync(process.env.QDD_LOCKJS, 'utf8');
    const [beforeJson, afterJson] = content.split(/^\/\*\*package-lock(?:\s|$)/m);
    if (afterJson) {
      const [json, rest] = afterJson.split(/\*\*\/$/m);
      if (rest) {
        try {
          tree = JSON.parse(json.replace(/^\s*\*/mg, ""));
        } catch (err) {
          throw new Error('badly formed in-line package-lock');
        }
      }
    }
  } else {
    throw e;
  }
}

const todos = [];
function install (mod, dir) {
  const deps = mod.dependencies;
  if (!deps) return;

  const depEntries = Object.entries(deps);
  for (const [name, entry] of depEntries) {
    if (entry.bundled) {
      continue;
    }
    if (isProd && entry.dev) {
      continue;
    }

    const { integrity, resolved: url } = entry;
    if (!integrity || !url) {
      console.error('invalid entry found in package-lock.json');
      console.error(util.inspect({ [name]: entry }));
      console.error('fix this, delete node_modules, and try again');
      process.exit(1);
    }
    const destDir = useDest ? `${dir}/node_modules/${name}` : null;
    const cacheDir = useCache ? config.cacheDir + '/' + integrity : null;
    todos.push(installOne.bind(null, name, integrity, url, destDir, cacheDir));
    if (entry.dependencies) {
      install(entry, destDir);
    }
  }
}

function installOne (name, integrity, url, destDir, cacheDir, cb) {
  if (cacheDir) {
    isdir(cacheDir, (err, isDir) => {
      if (err || !isDir) {
        return download(url, integrity, cacheDir, destDir, cb);
      }
      if (useDest) {
        cpr(cacheDir, destDir, cb);
      }
    });
  } else {
    return download(url, integrity, cacheDir, destDir, cb);
  }
}

function doTheTodos () {
  for (const fn of todos) {
    fn(err => {
      if (err) {
        throw err;
      }
    });
  }
}

install(tree, process.cwd());

if (useCache) {
  mkdirp(config.cacheDir, (err) => {
    if (err) {
      throw err;
    }
    doTheTodos();
  });
} else {
  doTheTodos();
}
