// One wind for the whole world — now the platform's (services/vegetation/wind.ts, which grew out of this file): the
// veering direction, gusts rolling downwind as travelling bands, local impulses, and the cloth helpers (noren, banners,
// sails, awnings). Users here: grassField.ts, forest.ts, undergrowth.ts, village.ts / otsu.ts / chapter1.ts, precip.ts.
import { wind } from '../../../../services/vegetation/wind';

export * from '../../../../services/vegetation/wind';

wind.strength.value = 0.6;   // Era Clash's starting breeze (the weather sets it from then on)
