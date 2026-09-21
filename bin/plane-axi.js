#!/usr/bin/env node
// plane-axi — ergonomic CLI for the Plane project tracker
// Version fast path: answer before the CLI graph loads.
import { VERSION } from '../lib/version.js'; // leaf module — no other imports
const a = process.argv[2];
if (a === '-v' || a === '-V' || a === '--version') {
  console.log(VERSION);
  process.exit(0);
}
const { main } = await import('../lib/cli.js');
main();
