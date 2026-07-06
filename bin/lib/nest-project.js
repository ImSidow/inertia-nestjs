'use strict';

const fs = require('fs');
const path = require('path');

function isNestProject(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return false;
  }

  const deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  return Boolean(deps['@nestjs/core']);
}

module.exports = { isNestProject };
