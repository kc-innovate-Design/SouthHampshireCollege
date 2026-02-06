
export enum SectionKey {
  PROJECT_LIST = 'projects',
  OVERVIEW = 'overview',
  ABOUT = 'about',
  PESTLE = 'pestle',
  PORTERS = 'porters',
  MARKETING = 'marketing',
  SWOT = 'swot'
}

export interface Idea {
  id: string;
  text: string;
  isAiGenerated: boolean;
  isSelected: boolean;
  order: number;
}

export interface FrameworkItem {
  id: string;
  title: string;
  color: string;
  ideas: Idea[];
  justification: string;
}

export interface ProjectState {
  id: string;
  name: string;
  lastUpdated: number;
  businessDetails: string;
  businessFiles: { id: string; name: string; content: string }[];
  frameworks: {
    [key: string]: FrameworkItem[];
  };
}

export interface SectionDefinition {
  key: SectionKey;
  label: string;
  icon: string;
}
