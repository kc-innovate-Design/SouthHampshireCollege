import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';
import { SectionKey, ProjectState, Idea, FrameworkItem } from './types';
import { SECTIONS, FRAMEWORK_CONFIGS } from './constants';

const PROJECTS_STORAGE_KEY = 'strategy_suite_all_projects';
const ACTIVE_PROJECT_ID_KEY = 'strategy_suite_active_id';

const createNewProject = (name: string): ProjectState => ({
  id: Math.random().toString(36).substr(2, 9),
  name,
  lastUpdated: Date.now(),
  businessDetails: '',
  businessFiles: [],
  frameworks: Object.keys(FRAMEWORK_CONFIGS).reduce((acc, key) => {
    acc[key] = FRAMEWORK_CONFIGS[key].map(cfg => ({
      id: cfg.id,
      title: cfg.title,
      color: cfg.color,
      ideas: [],
      justification: ''
    }));
    return acc;
  }, {} as any),
});

const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectState[]>(() => {
    const saved = localStorage.getItem(PROJECTS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [activeSection, setActiveSection] = useState<SectionKey>(() => {
    const activeId = localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
    return activeId ? SectionKey.OVERVIEW : SectionKey.PROJECT_LIST;
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem(ACTIVE_PROJECT_ID_KEY);
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  // Current active project state
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  useEffect(() => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_ID_KEY, activeProjectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_ID_KEY);
    }
  }, [activeProjectId]);

  const updateActiveProject = (updater: (prev: ProjectState) => ProjectState) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return { ...updater(p), lastUpdated: Date.now() };
      }
      return p;
    }));
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    const project = createNewProject(newProjectName.trim());
    setProjects(prev => [project, ...prev]);
    setActiveProjectId(project.id);
    setActiveSection(SectionKey.ABOUT);
    setNewProjectName('');
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setActiveSection(SectionKey.PROJECT_LIST);
    }
  };

  const selectProject = (id: string) => {
    setActiveProjectId(id);
    setActiveSection(SectionKey.OVERVIEW);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !activeProject) return;

    for (const file of Array.from(files) as File[]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateActiveProject(prev => ({
          ...prev,
          businessFiles: [
            ...prev.businessFiles,
            { id: Math.random().toString(36).substr(2, 9), name: file.name, content: content.substring(0, 5000) }
          ]
        }));
      };
      reader.readAsText(file);
    }
  };

  const generateIdeas = async (frameworkKey: SectionKey, itemId: string, promptOverride?: string) => {
    if (!activeProject) return;
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const businessContext = `Business Context: ${activeProject.businessDetails}. Additional files: ${activeProject.businessFiles.map(f => f.content).join(' ')}`;
      const frameworkItem = activeProject.frameworks[frameworkKey].find(i => i.id === itemId);
      
      const prompt = `
        You are a world-class strategic consultant.
        Propose 3 distinct ideas for the "${frameworkItem?.title}" category of a ${frameworkKey.toUpperCase()} framework.
        
        CONTEXT:
        ${businessContext}
        ${promptOverride ? `SPECIFIC FOCUS: ${promptOverride}` : ''}
        
        CONSTRAINTS:
        - UK English spelling ONLY (e.g., 'organise', 'specialised', 'analysing').
        - MAXIMUM 7 words per idea.
        - Exactly 3 ideas.
        - Professional, specific, and actionable.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt,
        config: { 
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const raw = response.text || '[]';
      const suggestions: string[] = JSON.parse(raw);

      updateActiveProject(prev => {
        const newFrameworks = { ...prev.frameworks };
        const items = [...newFrameworks[frameworkKey]];
        const idx = items.findIndex(i => i.id === itemId);
        const newIdeas: Idea[] = suggestions.map((text, i) => ({
          id: Math.random().toString(36).substr(2, 9),
          text: `${text} (AI)`,
          isAiGenerated: true,
          isSelected: false,
          order: items[idx].ideas.length + i
        }));
        items[idx] = { ...items[idx], ideas: [...items[idx].ideas, ...newIdeas] };
        newFrameworks[frameworkKey] = items;
        return { ...prev, frameworks: newFrameworks };
      });
    } catch (error) {
      console.error('AI generation failed', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const moveIdea = (frameworkKey: SectionKey, itemId: string, ideaId: string, direction: 'up' | 'down') => {
    updateActiveProject(prev => {
      const newFrameworks = { ...prev.frameworks };
      const items = [...newFrameworks[frameworkKey]];
      const itemIdx = items.findIndex(i => i.id === itemId);
      const ideas = [...items[itemIdx].ideas];
      const ideaIdx = ideas.findIndex(i => i.id === ideaId);
      
      const targetIdx = direction === 'up' ? ideaIdx - 1 : ideaIdx + 1;
      if (targetIdx >= 0 && targetIdx < ideas.length) {
        [ideas[ideaIdx], ideas[targetIdx]] = [ideas[targetIdx], ideas[ideaIdx]];
      }
      
      items[itemIdx] = { ...items[itemIdx], ideas };
      newFrameworks[frameworkKey] = items;
      return { ...prev, frameworks: newFrameworks };
    });
  };

  const downloadHtml = () => {
    if (!activeProject) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>StrategySuite Export - ${activeProject.name}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: 'Inter', sans-serif; background: #f9fafb; padding: 40px; }
            .card { background: white; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
            .section-title { font-size: 24px; font-weight: 700; color: #4f46e5; margin-bottom: 20px; text-transform: uppercase; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
          </style>
      </head>
      <body>
          <div class="max-w-5xl mx-auto">
              <h1 class="text-4xl font-black mb-2">${activeProject.name}</h1>
              <p class="text-gray-400 font-bold uppercase tracking-widest text-xs mb-8">Strategic Analysis Report</p>
              
              <div class="card">
                <h2 class="section-title">Business Overview</h2>
                <p class="whitespace-pre-wrap text-gray-700">${activeProject.businessDetails || 'No details provided.'}</p>
              </div>

              ${(Object.entries(activeProject.frameworks) as [string, FrameworkItem[]][]).map(([key, items]) => `
                <div class="mb-12">
                  <h2 class="section-title">${key} Analysis</h2>
                  <div class="grid">
                    ${items.map(item => `
                      <div class="card" style="border-top: 6px solid ${item.color}">
                        <h3 class="font-bold text-lg mb-4">${item.title}</h3>
                        <div class="space-y-2 mb-4">
                          ${item.ideas.filter(i => i.isSelected).map(i => `
                            <div class="p-2 bg-gray-50 rounded border border-gray-100 text-sm">ÔÇó ${i.text}</div>
                          `).join('')}
                          ${item.ideas.filter(i => i.isSelected).length === 0 ? '<p class="text-gray-400 italic text-sm">No items selected.</p>' : ''}
                        </div>
                        <div class="text-xs text-gray-500 italic mt-4 border-t pt-2">
                          <strong>Justification:</strong> ${item.justification || 'None provided.'}
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
          </div>
      </body>
      </html>
    `;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Strategy_Report_${activeProject.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
  };

  const renderProjectList = () => (
    <div className="space-y-10 max-w-5xl mx-auto p-8">
      <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
        <h2 className="text-4xl font-black mb-3 text-gray-900">My Strategy Suite</h2>
        <p className="text-gray-500 font-medium text-lg">Create a new strategic workspace or continue where you left off.</p>
        
        <form onSubmit={handleCreateProject} className="mt-8 flex gap-3">
          <input
            type="text"
            className="flex-1 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all text-lg"
            placeholder="Enter a name for your new project..."
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
          <button type="submit" className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-3 uppercase tracking-widest text-xs">
            <i className="fa-solid fa-plus"></i>
            Create Project
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map(p => (
          <div 
            key={p.id} 
            onClick={() => selectProject(p.id)}
            className={`bg-white p-8 rounded-3xl border transition-all flex flex-col justify-between group cursor-pointer ${activeProjectId === p.id ? 'border-indigo-500 shadow-indigo-100 shadow-xl ring-2 ring-indigo-500 ring-offset-2' : 'border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1'}`}
          >
            <div>
              <div className="flex justify-between items-start mb-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110 ${activeProjectId === p.id ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                  <i className="fa-solid fa-folder"></i>
                </div>
                <button 
                  onClick={(e) => handleDeleteProject(p.id, e)}
                  className="w-8 h-8 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                >
                  <i className="fa-solid fa-trash-can text-xs"></i>
                </button>
              </div>
              <h3 className="font-black text-xl mb-2 text-gray-800 line-clamp-1">{p.name}</h3>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-4">
                Last modified: {new Date(p.lastUpdated).toLocaleDateString()}
              </p>
              <div className="flex gap-1 mb-8">
                {Object.keys(FRAMEWORK_CONFIGS).map(key => {
                  const items = p.frameworks[key];
                  const doneCount = items.filter(f => f.ideas.some(i => i.isSelected)).length;
                  const total = items.length;
                  const pct = (doneCount / total) * 100;
                  return (
                    <div key={key} className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden" title={`${key.toUpperCase()}: ${doneCount}/${total}`}>
                      <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }}></div>
                    </div>
                  );
                })}
              </div>
            </div>
            <button className={`w-full py-3 text-center font-black rounded-xl transition-all text-xs uppercase tracking-widest border ${activeProjectId === p.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-indigo-600 border-indigo-50 hover:bg-indigo-600 hover:text-white'}`}>
              Continue Project
            </button>
          </div>
        ))}

        {projects.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white border-2 border-dashed border-gray-100 rounded-3xl">
            <i className="fa-solid fa-folder-open text-6xl text-gray-100 mb-4"></i>
            <h3 className="text-xl font-bold text-gray-300">No projects yet</h3>
            <p className="text-gray-400">Start by creating your first project above.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderActiveContent = () => {
    if (activeSection === SectionKey.PROJECT_LIST) return renderProjectList();
    if (!activeProject) return renderProjectList();

    switch (activeSection) {
      case SectionKey.OVERVIEW: return <Overview activeProject={activeProject} setActiveSection={setActiveSection} />;
      case SectionKey.ABOUT: return <About activeProject={activeProject} updateActiveProject={updateActiveProject} setActiveSection={setActiveSection} handleFileUpload={handleFileUpload} />;
      case SectionKey.PESTLE: return <FrameworkSection sectionKey={SectionKey.PESTLE} nextSection={SectionKey.PORTERS} activeProject={activeProject} updateActiveProject={updateActiveProject} generateIdeas={generateIdeas} moveIdea={moveIdea} isGenerating={isGenerating} setActiveSection={setActiveSection} />;
      case SectionKey.PORTERS: return <FrameworkSection sectionKey={SectionKey.PORTERS} nextSection={SectionKey.MARKETING} activeProject={activeProject} updateActiveProject={updateActiveProject} generateIdeas={generateIdeas} moveIdea={moveIdea} isGenerating={isGenerating} setActiveSection={setActiveSection} />;
      case SectionKey.MARKETING: return <FrameworkSection sectionKey={SectionKey.MARKETING} nextSection={SectionKey.SWOT} activeProject={activeProject} updateActiveProject={updateActiveProject} generateIdeas={generateIdeas} moveIdea={moveIdea} isGenerating={isGenerating} setActiveSection={setActiveSection} />;
      case SectionKey.SWOT: return <FrameworkSection sectionKey={SectionKey.SWOT} activeProject={activeProject} updateActiveProject={updateActiveProject} generateIdeas={generateIdeas} moveIdea={moveIdea} isGenerating={isGenerating} setActiveSection={setActiveSection} />;
      default: return renderProjectList();
    }
  };

  const renderSidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-50 bg-white border-r transform transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full md:w-16 md:translate-x-0'} flex flex-col`}>
      <div className={`p-6 border-b flex justify-between items-center overflow-hidden whitespace-nowrap`}>
        {isSidebarOpen && <h1 className="text-xl font-bold text-indigo-600">StrategySuite</h1>}
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${!isSidebarOpen ? 'mx-auto' : ''}`}>
          <i className={`fa-solid ${isSidebarOpen ? 'fa-indent' : 'fa-outdent'}`}></i>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-4 overflow-x-hidden">
        {SECTIONS.map((section) => {
          const isDisabled = !activeProjectId && section.key !== SectionKey.PROJECT_LIST;
          return (
            <button
              key={section.key}
              disabled={isDisabled}
              onClick={() => { setActiveSection(section.key); if (window.innerWidth < 768) setIsSidebarOpen(false); }}
              className={`w-full flex items-center px-6 py-3 text-sm font-medium transition-colors group ${activeSection === section.key ? 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' : 'text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed'}`}
            >
              <i className={`fa-solid ${section.icon} w-6 text-center ${!isSidebarOpen ? 'mx-auto' : 'mr-3'}`}></i>
              {isSidebarOpen && <span>{section.label}</span>}
            </button>
          );
        })}
      </nav>
      {isSidebarOpen && activeProject && (
        <div className="p-4 border-t space-y-2">
          <div className="px-2 mb-2">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">Project</p>
            <p className="text-xs font-bold text-gray-700 truncate">{activeProject.name}</p>
          </div>
          <button onClick={downloadHtml} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-semibold">
            <i className="fa-solid fa-download"></i>
            Export HTML
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-white text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-gray-900/10 backdrop-blur-sm md:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      {renderSidebar()}

      {/* Main container sits to the side of the fixed sidebar on desktop */}
      <main className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isSidebarOpen ? 'md:ml-64' : 'md:ml-16'}`}>
        <header className="h-16 bg-white border-b flex items-center px-6 justify-between sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className={`${isSidebarOpen ? 'hidden' : 'flex'} md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-lg`}>
              <i className="fa-solid fa-bars"></i>
            </button>
            <h2 className="font-black text-gray-400 uppercase tracking-widest text-[10px] truncate">
              {activeSection === SectionKey.PROJECT_LIST ? 'Manage Projects' : `${activeProject?.name} ÔÇó ${SECTIONS.find(s => s.key === activeSection)?.label}`}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {isGenerating && (
              <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full shadow-sm animate-pulse">
                <i className="fa-solid fa-cog animate-spin"></i>
                AI is Analysing...
              </div>
            )}
            <div className="h-8 w-[1px] bg-gray-100 mx-2"></div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <i className="fa-solid fa-user text-xs"></i>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 hidden sm:inline">Analyst Mode</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 relative">
          {renderActiveContent()}
        </div>
      </main>
    </div>
  );
};

// --- View Components ---

const Overview: React.FC<{ activeProject: ProjectState, setActiveSection: (s: SectionKey) => void }> = ({ activeProject, setActiveSection }) => (
  <div className="space-y-10 max-w-5xl mx-auto p-8">
    <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
      <h2 className="text-4xl font-black mb-3 text-gray-900">{activeProject.name}</h2>
      <p className="text-gray-500 font-medium text-lg">Detailed progress tracking for your strategic frameworks.</p>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
      {SECTIONS.filter(s => s.key !== SectionKey.OVERVIEW && s.key !== SectionKey.PROJECT_LIST).map(s => {
        const isComplete = s.key === SectionKey.ABOUT 
          ? activeProject.businessDetails.length > 50 
          : activeProject.frameworks[s.key].every(f => f.ideas.some(i => i.isSelected));
        
        return (
          <div key={s.key} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex justify-between items-start mb-6">
                <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110">
                  <i className={`fa-solid ${s.icon}`}></i>
                </div>
                <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isComplete ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {isComplete ? 'Ready' : 'Incomplete'}
                </span>
              </div>
              <h3 className="font-black text-xl mb-4 text-gray-800">{s.label}</h3>
              <div className="mb-8">
                {s.key !== SectionKey.ABOUT && (
                  <div className="flex flex-wrap gap-2">
                    {activeProject.frameworks[s.key].map(f => (
                      <div key={f.id} className={`w-4 h-4 rounded-full transition-colors ${f.ideas.some(i => i.isSelected) ? 'bg-indigo-500 shadow-sm' : 'bg-gray-100'}`} title={f.title}></div>
                    ))}
                  </div>
                )}
                {s.key === SectionKey.ABOUT && (
                  <div className="text-sm text-gray-400">
                    {activeProject.businessDetails.length > 0 ? `${activeProject.businessDetails.length} characters written.` : 'Not started yet.'}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => setActiveSection(s.key)} className="w-full py-3 text-center bg-gray-50 text-indigo-600 font-black rounded-xl hover:bg-indigo-600 hover:text-white transition-all text-xs uppercase tracking-widest border border-indigo-50">
              Open Section
            </button>
          </div>
        );
      })}
    </div>
  </div>
);

const About: React.FC<{ activeProject: ProjectState, updateActiveProject: (u: (p: ProjectState) => ProjectState) => void, setActiveSection: (s: SectionKey) => void, handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void }> = ({ activeProject, updateActiveProject, setActiveSection, handleFileUpload }) => (
  <div className="space-y-10 max-w-4xl mx-auto p-8">
    <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
      <h2 className="text-3xl font-black mb-4 text-gray-900">1. About the Business</h2>
      <p className="text-gray-500 mb-8 font-medium">Clear context leads to better strategic suggestions. Describe the subject in detail.</p>
      <textarea
        value={activeProject.businessDetails}
        onChange={(e) => updateActiveProject(prev => ({ ...prev, businessDetails: e.target.value }))}
        className="w-full h-64 p-6 bg-gray-50 border border-gray-100 rounded-3xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all text-lg text-gray-700"
        placeholder="e.g. A South UK SME in the aerospace industry that specialises in tyres..."
      />
    </div>

    <div className="bg-white p-10 rounded-3xl shadow-sm border border-gray-100">
      <h3 className="text-xl font-black mb-6 flex items-center gap-3">
        <i className="fa-solid fa-file-invoice text-indigo-600"></i>
        Context Documents
      </h3>
      <div className="border-4 border-dashed border-gray-50 rounded-3xl p-12 text-center hover:border-indigo-100 transition-colors cursor-pointer relative group">
        <input type="file" multiple accept=".html,.txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
        <i className="fa-solid fa-folder-open text-5xl text-gray-200 mb-4 group-hover:text-indigo-200 transition-colors"></i>
        <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Drop HTML context files here</p>
      </div>
      
      {activeProject.businessFiles.length > 0 && (
        <div className="mt-8 space-y-4">
          {activeProject.businessFiles.map((file) => (
            <div key={file.id} className="p-5 border border-gray-100 rounded-2xl bg-white shadow-sm flex flex-col gap-3 group">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <i className="fa-solid fa-file-lines text-indigo-300"></i>
                  <input
                    className="font-bold text-gray-700 bg-transparent border-none focus:outline-none"
                    value={file.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      updateActiveProject(prev => ({
                        ...prev,
                        businessFiles: prev.businessFiles.map(f => f.id === file.id ? { ...f, name } : f)
                      }));
                    }}
                  />
                </div>
                <button onClick={() => updateActiveProject(prev => ({ ...prev, businessFiles: prev.businessFiles.filter(f => f.id !== file.id) }))} className="w-8 h-8 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <textarea
                className="text-sm text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-3 h-24 focus:text-gray-700 transition-colors"
                value={file.content}
                onChange={(e) => {
                  const content = e.target.value;
                  updateActiveProject(prev => ({
                    ...prev,
                    businessFiles: prev.businessFiles.map(f => f.id === file.id ? { ...f, content } : f)
                  }));
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
    
    <div className="flex justify-end pt-6">
      <button onClick={() => setActiveSection(SectionKey.PESTLE)} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-3 uppercase tracking-widest text-xs">
        Proceed to PESTLE <i className="fa-solid fa-chevron-right"></i>
      </button>
    </div>
  </div>
);

const FrameworkSection: React.FC<{ 
  sectionKey: SectionKey; 
  nextSection?: SectionKey; 
  activeProject: ProjectState;
  updateActiveProject: (u: (p: ProjectState) => ProjectState) => void;
  generateIdeas: (k: SectionKey, i: string, p?: string) => void;
  moveIdea: (k: SectionKey, i: string, id: string, d: 'up' | 'down') => void;
  isGenerating: boolean;
  setActiveSection: (s: SectionKey) => void;
}> = ({ sectionKey, nextSection, activeProject, updateActiveProject, generateIdeas, moveIdea, isGenerating, setActiveSection }) => {
  const items = activeProject.frameworks[sectionKey];
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [showOnlySelected, setShowOnlySelected] = useState<Record<string, boolean>>({});

  const handleAddIdea = (itemId: string) => {
    const text = newItemText[itemId]?.trim();
    if (!text) return;
    updateActiveProject(prev => {
      const newFrameworks = { ...prev.frameworks };
      const itemsList = [...newFrameworks[sectionKey]];
      const idx = itemsList.findIndex(i => i.id === itemId);
      const newIdea: Idea = {
        id: Math.random().toString(36).substr(2, 9),
        text,
        isAiGenerated: false,
        isSelected: true,
        order: itemsList[idx].ideas.length
      };
      itemsList[idx] = { ...itemsList[idx], ideas: [...itemsList[idx].ideas, newIdea] };
      newFrameworks[sectionKey] = itemsList;
      return { ...prev, frameworks: newFrameworks };
    });
    setNewItemText(prev => ({ ...prev, [itemId]: '' }));
  };

  const toggleIdeaSelection = (itemId: string, ideaId: string) => {
    updateActiveProject(prev => {
      const newFrameworks = { ...prev.frameworks };
      const itemsList = [...newFrameworks[sectionKey]];
      const itemIdx = itemsList.findIndex(i => i.id === itemId);
      const ideas = itemsList[itemIdx].ideas.map(i => i.id === ideaId ? { ...i, isSelected: !i.isSelected } : i);
      itemsList[itemIdx] = { ...itemsList[itemIdx], ideas };
      newFrameworks[sectionKey] = itemsList;
      return { ...prev, frameworks: newFrameworks };
    });
  };

  return (
    <div className="relative pb-24 bg-gray-50 min-h-full">
      {/* Sticky Full-Width Summary Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 py-4 px-6 shadow-sm">
        <div className="w-full grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-full">
          {items.map(item => (
            <div 
              key={item.id} 
              className="p-3.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between h-full transition-all" 
              style={{ backgroundColor: item.color }}
            >
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2 truncate opacity-70">
                  {item.title}
                </h4>
                <div className="space-y-1.5 min-h-[44px]">
                  {item.ideas.filter(i => i.isSelected).map(i => (
                    <div key={i.id} className="text-[11px] leading-tight font-bold text-gray-800 line-clamp-2">
                      ÔÇó {i.text}
                    </div>
                  ))}
                  {item.ideas.filter(i => i.isSelected).length === 0 && (
                    <div className="text-[10px] text-gray-400 italic">No selections</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8 space-y-12">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-3xl font-black mb-2 uppercase tracking-tight text-gray-900">{SECTIONS.find(s => s.key === sectionKey)?.label}</h2>
          <p className="text-gray-500">Conduct a professional strategic analysis. Select the best ideas to populate your framework above.</p>
        </div>

        {items.map((item) => {
          const selectedIdeas = item.ideas.filter(i => i.isSelected);
          const unselectedIdeas = item.ideas.filter(i => !i.isSelected);
          const visibleIdeas = showOnlySelected[item.id] ? selectedIdeas : [...selectedIdeas, ...unselectedIdeas];

          return (
            <div key={item.id} id={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-300">
              <div className="h-2 w-full" style={{ backgroundColor: item.color }}></div>
              <div className="p-8">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-800">{item.title}</h3>
                    <p className="text-gray-500 text-sm">Review AI suggestions or add your own specialized ideas.</p>
                  </div>
                  <button
                    onClick={() => generateIdeas(sectionKey, item.id)}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-md"
                  >
                    <i className={`fa-solid fa-sparkles ${isGenerating ? 'animate-spin' : ''}`}></i>
                    Generate Ideas
                  </button>
                </div>

                <div className="flex gap-2 mb-8">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      className="w-full pl-4 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder={`Add ${item.title.toLowerCase()}...`}
                      value={newItemText[item.id] || ''}
                      onChange={(e) => setNewItemText(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddIdea(item.id)}
                    />
                    <button 
                      onClick={() => generateIdeas(sectionKey, item.id, newItemText[item.id])}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600 transition-colors p-1"
                      title="Use input as prompt"
                    >
                      <i className="fa-solid fa-wand-magic-sparkles"></i>
                    </button>
                  </div>
                  <button onClick={() => handleAddIdea(item.id)} className="px-6 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
                    <i className="fa-solid fa-plus font-bold"></i>
                  </button>
                </div>

                <div className="flex justify-between items-center mb-4 pb-2">
                  <h4 className="font-black text-gray-400 uppercase text-[10px] tracking-[0.2em]">Strategy Log</h4>
                  <button onClick={() => setShowOnlySelected(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                    <i className={`fa-solid ${showOnlySelected[item.id] ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                    {showOnlySelected[item.id] ? 'Show all ideas' : 'Filter by selected'}
                  </button>
                </div>

                <div className="space-y-3 mb-8 min-h-[40px]">
                  {visibleIdeas.map((idea) => (
                    <div key={idea.id} className={`group flex items-center gap-3 p-3.5 rounded-xl border transition-all ${idea.isSelected ? 'border-indigo-200 bg-indigo-50/20' : 'border-gray-100 bg-white'}`}>
                      <button onClick={() => toggleIdeaSelection(item.id, idea.id)} className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${idea.isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'border-2 border-gray-200 text-transparent hover:border-indigo-300 bg-gray-50'}`}>
                        <i className="fa-solid fa-check text-[10px]"></i>
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        {idea.isAiGenerated ? (
                          <div className="text-gray-800 font-semibold text-sm truncate">{idea.text}</div>
                        ) : (
                          <input
                            className="w-full bg-transparent font-semibold text-sm focus:outline-none"
                            value={idea.text}
                            onChange={(e) => {
                              const text = e.target.value;
                              updateActiveProject(prev => {
                                const newFrameworks = { ...prev.frameworks };
                                const list = [...newFrameworks[sectionKey]];
                                const iIdx = list.findIndex(i => i.id === item.id);
                                // FIX: Declare updatedIdeas with const to fix scope errors on lines 712 and 713
                                const updatedIdeas = list[iIdx].ideas.map(i => i.id === idea.id ? { ...i, text } : i);
                                list[iIdx] = { ...list[iIdx], ideas: updatedIdeas };
                                newFrameworks[sectionKey] = list;
                                return { ...prev, frameworks: newFrameworks };
                              });
                            }}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveIdea(sectionKey, item.id, idea.id, 'up')} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                          <i className="fa-solid fa-chevron-up text-[10px]"></i>
                        </button>
                        <button onClick={() => moveIdea(sectionKey, item.id, idea.id, 'down')} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded">
                          <i className="fa-solid fa-chevron-down text-[10px]"></i>
                        </button>
                        <button 
                          onClick={() => updateActiveProject(prev => {
                            const fws = { ...prev.frameworks };
                            const l = [...fws[sectionKey]];
                            const ii = l.findIndex(i => i.id === item.id);
                            l[ii] = { ...l[ii], ideas: l[ii].ideas.filter(i => i.id !== idea.id) };
                            fws[sectionKey] = l;
                            return { ...prev, frameworks: fws };
                          })}
                          className="p-1.5 text-gray-300 hover:text-red-500 rounded ml-1"
                        >
                          <i className="fa-solid fa-trash-can text-[10px]"></i>
                        </button>
                      </div>
                    </div>
                  ))}
                  {visibleIdeas.length === 0 && (
                    <div className="text-center py-6 text-gray-300 italic text-sm border-2 border-dashed border-gray-100 rounded-xl">No ideas to display.</div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Decision Justification</label>
                  <textarea
                    className="w-full h-28 p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-700"
                    placeholder="Explain your choices for this section..."
                    value={item.justification}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateActiveProject(prev => {
                        const fws = { ...prev.frameworks };
                        const l = [...fws[sectionKey]];
                        const ii = l.findIndex(i => i.id === item.id);
                        l[ii] = { ...l[ii], justification: val };
                        fws[sectionKey] = l;
                        return { ...prev, frameworks: fws };
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {nextSection && (
          <div className="flex justify-center pt-10">
            <button onClick={() => setActiveSection(nextSection)} className="px-14 py-4.5 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-3 group uppercase tracking-widest text-sm">
              Next: {SECTIONS.find(s => s.key === nextSection)?.label}
              <i className="fa-solid fa-arrow-right group-hover:translate-x-1.5 transition-transform"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);
