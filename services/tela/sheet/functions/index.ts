// functions — load every category so the registry is complete, then re-export it.
import './math';
import './stat';
import './logical';
import './lookup';
import './text';
import './date';
import './financial';
import './info';
import './engineering';
import './database';

import { setBuiltinCheck } from '../parser';
import { getFn as lookupFn } from './registry';
setBuiltinCheck(name => !!lookupFn(name));

export { getFn, listFunctions, functionCount, suggestFunctions, invoke, type FnDef, type FnInfo, type FnCategory } from './registry';
