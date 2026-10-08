import '@project-chip/matter-node.js';
import { CommissioningController } from '@project-chip/matter.js';
import { Environment } from '@matter/nodejs';

console.log('CommissioningController loaded:', typeof CommissioningController);
console.log('Environment loaded:', typeof Environment);
process.exit(0);
