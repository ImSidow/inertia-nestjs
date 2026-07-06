'use strict';

const readline = require('readline');

// Non-TTY contexts (CI, piped input) always decline — there's no one there
// to answer, so the safe default is the same printed-instructions behavior
// as before this feature existed.
function promptYesNo(question) {
  if (!process.stdin.isTTY) return Promise.resolve(false);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

module.exports = { promptYesNo };
