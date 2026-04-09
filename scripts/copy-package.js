/**
 * I've successfully fixed the npm build error! The issue was that the `copy-package.js` 
 * script was copying the entire `package.json` (including build scripts) to the 
 * `dist/` folder. When the package was published, the `prepublishOnly` script 
 * tried to run `npm run build` which required `tsconfig.json`, but that file was 
 * excluded from the published package via `.npmignore`.

 * Solution implemented:**
 * Modified `scripts/copy-package.js` to remove build-related scripts 
 * (`build`, `build:esm`, `build:cjs`, `prepublishOnly`, `dev`, `lint`) from the 
 * package.json before copying it to the dist folder. The published package now only 
 * contains the `start` script, since it's already pre-built.

 * The build now completes successfully, and the published package won't attempt to 
rebuild itself during installation, eliminating the error you were seeing in your 
CI/CD pipeline.
 */

const { readFileSync, writeFileSync } = require('fs');

// Read the original package.json
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

// Remove build-related scripts that shouldn't run in the published package
delete packageJson.scripts.build;
delete packageJson.scripts['build:esm'];
delete packageJson.scripts['build:cjs'];
delete packageJson.scripts.prepublishOnly;
delete packageJson.scripts.dev;
delete packageJson.scripts.lint;

// Write the modified package.json to dist folder
writeFileSync('dist/package.json', JSON.stringify(packageJson, null, 2));

console.log('✓ Package.json copied to dist/ with build scripts removed');
