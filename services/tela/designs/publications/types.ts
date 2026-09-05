import type { TelaVectorObject } from '../../../../types';
import type { TelaPublicationTemplate, TelaPublicationPageType } from '../../../telaPublicationTemplates';
import type { DesignCtx } from '../types';

export interface PublicationCtx extends DesignCtx {
  template: TelaPublicationTemplate;
  pageType: TelaPublicationPageType;
  /** 0-based position in template.pages. */
  pageIndex: number;
  /** How many pages the publication has. */
  pageCount: number;
}
/** One designer per TEMPLATE id; it switches on ctx.pageType for every page of that publication. */
export type PublicationDesigner = (ctx: PublicationCtx) => TelaVectorObject[];
