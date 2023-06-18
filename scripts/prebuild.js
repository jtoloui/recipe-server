// build.js
const fs = require('fs');
const path = require('path');
const gitRev = require('git-rev-sync');
const package = require('../package.json');

const data = {
	buildTime: new Date().toISOString(),
	commitHash: gitRev.short(),
	version: package.version, // Optional: include the app version
};

fs.writeFileSync(path.join(__dirname, '../dist/build-info.json',), JSON.stringify(data), { overwrite: true });
