
import { SectionKey, SectionDefinition } from './types';

export const SECTIONS: SectionDefinition[] = [
  { key: SectionKey.PROJECT_LIST, label: 'My Projects', icon: 'fa-folder-tree' },
  { key: SectionKey.OVERVIEW, label: 'Project Overview', icon: 'fa-chart-pie' },
  { key: SectionKey.ABOUT, label: 'About Business', icon: 'fa-building' },
  { key: SectionKey.PESTLE, label: 'PESTLE Analysis', icon: 'fa-globe' },
  { key: SectionKey.PORTERS, label: 'Porters Five Forces', icon: 'fa-handshake' },
  { key: SectionKey.MARKETING, label: 'Marketing 4Ps', icon: 'fa-bullhorn' },
  { key: SectionKey.SWOT, label: 'SWOT Analysis', icon: 'fa-arrows-split-up-and-left' },
];

export const FRAMEWORK_CONFIGS: Record<string, { id: string; title: string; color: string }[]> = {
  [SectionKey.PESTLE]: [
    { id: 'political', title: 'Political', color: '#E0F2FE' }, // sky-100
    { id: 'economic', title: 'Economic', color: '#FEF9C3' }, // yellow-100
    { id: 'social', title: 'Social', color: '#FCE7F3' }, // pink-100
    { id: 'technological', title: 'Technological', color: '#DCFCE7' }, // green-100
    { id: 'legal', title: 'Legal', color: '#EDE9FE' }, // violet-100
    { id: 'environmental', title: 'Environmental', color: '#FFEDD5' }, // orange-100
  ],
  [SectionKey.PORTERS]: [
    { id: 'rivalry', title: 'Competitive Rivalry', color: '#FEE2E2' }, // red-100
    { id: 'suppliers', title: 'Supplier Power', color: '#DBEAFE' }, // blue-100
    { id: 'buyers', title: 'Buyer Power', color: '#F3E8FF' }, // purple-100
    { id: 'substitution', title: 'Threat of Substitution', color: '#ECFDF5' }, // emerald-50
    { id: 'new_entry', title: 'Threat of New Entry', color: '#FFF7ED' }, // orange-50
  ],
  [SectionKey.MARKETING]: [
    { id: 'product', title: 'Product', color: '#E0F2FE' },
    { id: 'price', title: 'Price', color: '#FEF9C3' },
    { id: 'place', title: 'Place', color: '#DCFCE7' },
    { id: 'promotion', title: 'Promotion', color: '#FCE7F3' },
  ],
  [SectionKey.SWOT]: [
    { id: 'strengths', title: 'Strengths', color: '#DCFCE7' },
    { id: 'weaknesses', title: 'Weaknesses', color: '#FEE2E2' },
    { id: 'opportunities', title: 'Opportunities', color: '#E0F2FE' },
    { id: 'threats', title: 'Threats', color: '#FEF9C3' },
  ],
};
