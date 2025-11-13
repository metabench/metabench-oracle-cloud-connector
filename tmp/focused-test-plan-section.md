## Focused Test Plan
- Jest: `npx jest --config jest.config.cjs --runTestsByPath src/tools/__tests__/js-scan.test.js --bail=1 --maxWorkers=50%` after each shared helper extraction. Run the matching `js-edit` suite when touching edit-specific flows.
- Jest: `npx jest --config jest.config.cjs --runTestsByPath src/tools/__tests__/ts-scan.test.js --bail=1 --maxWorkers=50%` whenever TypeScript metadata or dependency reporting changes.
- Smoke: `node src/tools/js-edit.js --help` and `node src/tools/js-scan.js --help` to ensure CLI translation and formatter wiring remain stable.
