// The Fixture Gallery's data: real fixtures with real specs and DMX modes from the Open Fixture
// Library (scripts/lighting/fetchFixtureCatalog.ts builds the file). Loaded on demand.

import type { FixtureProfile } from './fixtureProfiles';

export type FixtureForm = 'par' | 'bar' | 'mover-spot' | 'mover-wash' | 'mover-beam' | 'strobe' | 'blinder' | 'ellipsoidal' | 'panel' | 'tube' | 'fog' | 'string';

export interface CatalogFixture {
  id: string;
  manufacturer: string;
  name: string;
  categories: string[];
  form: FixtureForm;
  spec: {
    dimensionsMm?: number[];
    weightKg?: number;
    powerW?: number;
    dmxConnector?: string;
    source?: string;
    colorTempK?: number;
    lumens?: number;
    beamDeg?: number[];
    rdm?: boolean;
  };
  productPage?: string;
  manual?: string;
  profiles: FixtureProfile[];
}

export const FORM_LABEL: Record<FixtureForm, string> = {
  par: 'LED par', bar: 'Bar / batten', 'mover-spot': 'Moving spot', 'mover-wash': 'Moving wash', 'mover-beam': 'Moving beam',
  strobe: 'Strobe', blinder: 'Blinder', ellipsoidal: 'Profile / ellipsoidal', panel: 'Soft panel', tube: 'Pixel tube', fog: 'Fog / haze', string: 'Pixel string',
};

let cache: Promise<{ source: string; fixtures: CatalogFixture[] }> | null = null;

export const loadFixtureCatalog = () => {
  cache ??= import('../../data/lighting/fixtureCatalog.json').then((m) => m.default as unknown as { source: string; fixtures: CatalogFixture[] });
  return cache;
};

export function searchCatalog(fixtures: CatalogFixture[], query: string, form: FixtureForm | 'all'): CatalogFixture[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return fixtures.filter((f) => {
    if (form !== 'all' && f.form !== form) return false;
    const hay = `${f.manufacturer} ${f.name} ${FORM_LABEL[f.form]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
