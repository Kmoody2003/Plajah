// Manage › Settings › Theme — the look of the platform while people are on this org's pages:
// colours (four accent levels + generated palettes), background, and an emoji/sticker/GIF pack.
// Visitors can opt out per org from the page's theme chip; this never changes their saved theme.

import React from 'react';
import { Palette } from 'lucide-react';
import type { Organization, ThemeSpec } from '../../types';
import { updateOrganization } from '../../services/organizationService';
import ThemeStudio from '../settings/ThemeStudio';

interface Props { org: Organization; canEdit: boolean; onOrgChange?: (o: Organization) => void }

const OrgThemeEditor: React.FC<Props> = ({ org, canEdit, onOrgChange }) => {
  const save = async (spec: ThemeSpec) => {
    await updateOrganization(org.id, { themeSpec: spec });
    onOrgChange?.({ ...org, themeSpec: spec });
  };
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white/[0.06] flex items-center justify-center shrink-0"><Palette size={18} className="text-[#FF8C00]" /></div>
        <div>
          <h2 className="text-lg font-black text-white">Org theme</h2>
          <p className="text-sm text-white/60 mt-1">
            When someone opens {org.name}, Plajah switches to this theme — colours, background and your own emojis, stickers and GIFs. Text colours are chosen automatically so everything stays readable. Visitors can turn it off for your page.
          </p>
        </div>
      </div>
      {!canEdit && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">Only the owner and org admins can change the org theme.</div>}
      <ThemeStudio scope="org" value={org.themeSpec} uploadPath={`orgs/${org.id}/theme`} canEdit={canEdit} onSave={save} />
    </div>
  );
};

export default OrgThemeEditor;
