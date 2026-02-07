import React, { useEffect, useState, useRef, useCallback } from "react";
import { signOut, User } from "firebase/auth";
import { auth } from "./firebase";
import { useUser } from "./contexts/UserContext";
import RequireAuth from "./components/RequireAuth";
import { SECTIONS, FRAMEWORK_CONFIGS } from "../constants";
import { ProjectState, SectionKey, Idea, FrameworkItem } from "../types";
import { loadProjects, saveProject, deleteProject as deleteProjectFromFirestore, migrateFromLocalStorage } from "./services/storageService";
// Note: Gemini AI is now accessed via secure backend API at /api/v1/generate-ideas

/**
 * StrategySuiteApp
 * Enforces Auth and renders the AppShell.
 */
export default function StrategySuiteApp() {
    const { user } = useUser();
    return (
        <AppShell user={user || undefined} />
    );
}

/**
 * AppShell
 * Persistent layout with sidebar and main content.
 */
function AppShell({ user }: { user?: User }) {
    const [projects, setProjects] = useState<ProjectState[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<SectionKey>(SectionKey.PROJECT_LIST);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProjectName, setNewProjectName] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);


    // Load projects from Firestore on mount
    useEffect(() => {
        if (!user?.uid) {
            setIsLoading(false);
            return;
        }

        async function initializeProjects() {
            try {
                // First, try to migrate any existing localStorage data
                const migratedProjects = await migrateFromLocalStorage(user!.uid);

                if (migratedProjects.length > 0) {
                    setProjects(migratedProjects);
                } else {
                    // Load projects from Firestore
                    const firestoreProjects = await loadProjects(user!.uid);
                    setProjects(firestoreProjects);
                }
            } catch (error) {
                console.error('Failed to initialize projects:', error);
            } finally {
                setIsLoading(false);
            }
        }

        initializeProjects();
    }, [user?.uid]);

    // Debounced save to Firestore when a project changes
    const saveProjectDebounced = useCallback((project: ProjectState) => {
        if (!user?.uid) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveProject(user.uid, project).catch(err => {
                console.error('Failed to save project:', err);
            });
        }, 1000); // Debounce for 1 second
    }, [user?.uid]);

    const updateActiveProject = (updater: (prev: ProjectState) => ProjectState) => {
        if (!activeProjectId) return;
        setProjects(prev => prev.map(p => {
            if (p.id === activeProjectId) {
                const updatedProject = { ...updater(p), lastUpdated: Date.now() };
                saveProjectDebounced(updatedProject);
                return updatedProject;
            }
            return p;
        }));
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || !activeProjectId) return;

        for (const file of Array.from(files) as File[]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target?.result as string;
                updateActiveProject(prev => ({
                    ...prev,
                    businessFiles: [
                        ...prev.businessFiles,
                        { id: Math.random().toString(36).substring(2, 9), name: file.name, content: content.substring(0, 5000) }
                    ]
                }));
            };
            reader.readAsText(file);
        }
    };

    const generateIdeas = async (frameworkKey: string, itemId: string, promptOverride?: string) => {
        const activeProject = projects.find(p => p.id === activeProjectId);
        if (!activeProject || !activeProjectId) return;

        setIsGenerating(true);
        try {
            const frameworkItem = activeProject.frameworks[frameworkKey].find(i => i.id === itemId);
            const businessContext = `Business Context: ${activeProject.businessDetails}. Additional files: ${activeProject.businessFiles.map(f => f.content).join(' ')}`;

            // Call secure backend API instead of exposing API key client-side
            const response = await fetch('/api/v1/generate-ideas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    frameworkKey,
                    itemTitle: frameworkItem?.title,
                    businessContext,
                    promptOverride
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'AI generation failed');
            }

            const data = await response.json();
            const suggestions: string[] = data.ideas;

            updateActiveProject(prev => {
                const newFrameworks = { ...prev.frameworks };
                const items = [...newFrameworks[frameworkKey]];
                const idx = items.findIndex(i => i.id === itemId);
                const newIdeas: Idea[] = suggestions.map((text, i) => ({
                    id: Math.random().toString(36).substring(2, 9),
                    text: `${text} (AI)`,
                    isAiGenerated: true,
                    isSelected: false,
                    order: (items[idx].ideas?.length || 0) + i
                }));
                items[idx] = { ...items[idx], ideas: [...items[idx].ideas, ...newIdeas] };
                newFrameworks[frameworkKey] = items;
                return { ...prev, frameworks: newFrameworks };
            });
        } catch (error) {
            console.error("AI generation failed", error);
            alert("Strategic analysis failed. Please ensure the server is running.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        const newProject: ProjectState = {
            id: Math.random().toString(36).substring(2, 9),
            name: newProjectName.trim(),
            lastUpdated: Date.now(),
            businessDetails: "",
            businessFiles: [],
            frameworks: Object.keys(FRAMEWORK_CONFIGS).reduce((acc, key) => {
                acc[key] = FRAMEWORK_CONFIGS[key].map(cfg => ({
                    id: cfg.id,
                    title: cfg.title,
                    color: cfg.color,
                    ideas: [],
                    justification: ""
                }));
                return acc;
            }, {} as any),
        };
        setProjects([newProject, ...projects]);
        setActiveProjectId(newProject.id);
        setActiveSection(SectionKey.ABOUT);
        setNewProjectName("");
        setIsModalOpen(false);

        // Save new project to Firestore
        if (user?.uid) {
            saveProject(user.uid, newProject).catch(err => {
                console.error('Failed to save new project:', err);
            });
        }
    };

    const handleDeleteProject = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this project?")) return;
        setProjects(projects.filter((p) => p.id !== id));
        if (activeProjectId === id) {
            setActiveProjectId(null);
            setActiveSection(SectionKey.PROJECT_LIST);
        }

        // Delete from Firestore
        if (user?.uid) {
            deleteProjectFromFirestore(user.uid, id).catch(err => {
                console.error('Failed to delete project:', err);
            });
        }
    };

    const activeProject = projects.find((p) => p.id === activeProjectId);

    const handleProjectSelect = (id: string) => {
        setActiveProjectId(id);
        setActiveSection(SectionKey.OVERVIEW);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 font-['Outfit']">
                <div className="p-8 text-center bg-white rounded-[40px] shadow-xl border border-gray-100 flex flex-col items-center gap-6">
                    <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Loading Projects...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 font-['Outfit'] h-screen overflow-hidden">
            {/* 🔐 GLOBAL HEADER */}
            <header className="h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center justify-between px-8 shrink-0 z-30">
                <div className="flex items-center gap-4">
                    <div
                        onClick={() => { setActiveProjectId(null); setActiveSection(SectionKey.PROJECT_LIST); }}
                        className="p-2 bg-indigo-600 rounded-lg shadow-md shadow-indigo-100 cursor-pointer hover:scale-105 transition-transform"
                    >
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <h1
                            onClick={() => { setActiveProjectId(null); setActiveSection(SectionKey.PROJECT_LIST); }}
                            className="font-extrabold text-xl text-gray-900 tracking-tight cursor-pointer"
                        >
                            StrategySuite
                        </h1>
                        {user && (
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest -mt-0.5">
                                Logged in as {user.displayName || user.email}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-indigo-100 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                        </svg>
                        New Project
                    </button>
                    <button
                        onClick={() => auth && signOut(auth)}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-300 flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Log out
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* 📂 SIDEBAR (Only visible when a project is selected) */}
                {activeProject && (
                    <aside className="w-80 bg-white border-r border-gray-100 flex flex-col shrink-0 hidden lg:flex">
                        <div className="p-6 border-b border-gray-50">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Strategic Workflow</p>
                            <button
                                onClick={() => { setActiveProjectId(null); setActiveSection(SectionKey.PROJECT_LIST); }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 mb-2 ${activeSection === SectionKey.PROJECT_LIST
                                    ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                                    : 'text-gray-500 hover:bg-gray-50'
                                    }`}
                            >
                                <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                </svg>
                                <span className="font-bold text-sm">Workspace Overview</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="space-y-1">
                                <p className="px-4 py-2 text-[10px] font-black text-indigo-400 uppercase tracking-widest">Active Roadmap</p>
                                {SECTIONS.filter(s => s.key !== SectionKey.PROJECT_LIST).map(section => (
                                    <button
                                        key={section.key}
                                        onClick={() => setActiveSection(section.key)}
                                        className={`w-full flex items-center justify-between group px-4 py-4 rounded-2xl transition-all duration-300 ${activeSection === section.key
                                            ? 'bg-white border border-indigo-100 shadow-xl shadow-indigo-100/50 text-indigo-700'
                                            : 'text-gray-500 hover:bg-gray-50 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <i className={`fas ${section.icon} w-5 shrink-0 text-center ${activeSection === section.key ? 'text-indigo-600' : 'text-gray-300 group-hover:text-indigo-400'}`} />
                                            <span className="font-bold text-sm uppercase tracking-tight">{section.label}</span>
                                        </div>
                                        <svg className={`w-4 h-4 shrink-0 transition-transform ${activeSection === section.key ? 'translate-x-0' : '-translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100'
                                            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>
                )}

                {/* 🖼️ MAIN CONTENT AREA */}
                <main className="flex-1 overflow-y-auto bg-gray-50/50 custom-scrollbar relative">
                    <div className="max-w-6xl mx-auto p-8 md:p-12">
                        {activeSection === SectionKey.PROJECT_LIST ? (
                            <WorkspaceView
                                projects={projects}
                                onOpenModal={() => setIsModalOpen(true)}
                                onSelectProject={handleProjectSelect}
                                onDeleteProject={handleDeleteProject}
                            />
                        ) : activeProject ? (
                            <ProjectRoadmap
                                project={activeProject}
                                section={activeSection}
                                onBack={() => { setActiveProjectId(null); setActiveSection(SectionKey.PROJECT_LIST); }}
                                updateActiveProject={updateActiveProject}
                                generateIdeas={generateIdeas}
                                handleFileUpload={handleFileUpload}
                                isGenerating={isGenerating}
                                setActiveSection={setActiveSection}
                            />
                        ) : (
                            <div className="text-center py-20">
                                <p className="text-gray-400 font-bold">Please select a project to begin the workshop.</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {/* 🏗️ CREATE PROJECT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-[40px] shadow-2xl shadow-indigo-200/50 p-10 animate-in zoom-in-95 duration-300">
                        <div className="mb-8">
                            <h3 className="text-3xl font-black text-gray-900 tracking-tight">New Project</h3>
                            <p className="text-gray-500 font-medium">Define your next strategic roadmap</p>
                        </div>
                        <form onSubmit={handleCreateProject} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 px-1">Project Name</label>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="e.g. Q1 Marketing Initiative"
                                    className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl transition-all duration-300 outline-none text-lg font-bold placeholder:text-gray-300"
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-4 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-200 transition-all duration-300 active:scale-[0.98]"
                                >
                                    Create Project
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * WorkspaceView
 * Shows the grid of projects.
 */
function WorkspaceView({ projects, onOpenModal, onSelectProject, onDeleteProject }: {
    projects: ProjectState[],
    onOpenModal: () => void,
    onSelectProject: (id: string) => void,
    onDeleteProject: (id: string, e: React.MouseEvent) => void
}) {
    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-10">
                <div>
                    <h2 className="text-4xl font-black text-gray-900 tracking-tight text-stroke-thin">Workspace</h2>
                    <p className="text-gray-500 mt-2 font-medium">Manage your strategic projects and ideas</p>
                </div>
                <button
                    onClick={onOpenModal}
                    className="group flex items-center gap-3 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all duration-300 active:scale-[0.98]"
                >
                    <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                    </svg>
                    New Project
                </button>
            </div>

            {projects.length === 0 ? (
                <div className="py-24 text-center bg-white rounded-[40px] border-2 border-dashed border-gray-100">
                    <div className="inline-block p-6 bg-gray-50 rounded-3xl mb-6">
                        <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </div>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">No projects found</p>
                    <p className="text-gray-500 mt-3 text-lg font-medium italic">Create your first strategic roadmap to get started.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {projects.map((p) => (
                        <div
                            key={p.id}
                            onClick={() => onSelectProject(p.id)}
                            className="group relative p-8 bg-white rounded-[40px] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/50 hover:border-indigo-100 transition-all duration-500 cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-8">
                                <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-indigo-50 transition-colors duration-300">
                                    <svg className="w-6 h-6 text-gray-400 group-hover:text-indigo-600 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                </div>
                                <button
                                    onClick={(e) => onDeleteProject(p.id, e)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-300 hover:text-red-500 transition-all duration-300"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>
                            <h3 className="text-2xl font-black text-gray-900 leading-tight mb-2 uppercase tracking-tight group-hover:text-indigo-600 transition-colors break-all line-clamp-2">{p.name}</h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Created {new Date(p.lastUpdated).toLocaleDateString()}
                            </p>

                            <div className="mt-10 flex items-center gap-2 text-indigo-600 font-bold text-sm">
                                <span>Open Workshop</span>
                                <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * ProjectRoadmap
 * The view for an individual project workshop.
 */
function ProjectRoadmap({
    project,
    section,
    onBack,
    updateActiveProject,
    generateIdeas,
    handleFileUpload,
    isGenerating,
    setActiveSection
}: {
    project: ProjectState,
    section: SectionKey,
    onBack: () => void,
    updateActiveProject: (u: (p: ProjectState) => ProjectState) => void,
    generateIdeas: (k: string, i: string, p?: string) => void,
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
    isGenerating: boolean,
    setActiveSection: (s: SectionKey) => void
}) {
    const currentSection = SECTIONS.find(s => s.key === section);

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 h-full flex flex-col relative">
            {/* STICKY SUMMARY HEADER (Only for Frameworks) */}
            {[SectionKey.PESTLE, SectionKey.PORTERS, SectionKey.MARKETING, SectionKey.SWOT].includes(section) && (
                <div className="sticky top-0 z-40 bg-white/60 backdrop-blur-xl border-b border-gray-100 -mx-12 px-12 py-4 mb-8 -mt-12 shadow-sm animate-in slide-in-from-top-full duration-500">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {(project.frameworks[section] || []).map(item => (
                            <div key={item.id} className="p-2 rounded-xl border border-gray-50 flex flex-col justify-start h-16 transition-all hover:scale-105" style={{ backgroundColor: item.color + '40' }}>
                                <h4 className="text-[8px] font-black uppercase tracking-widest text-gray-500 mb-1 truncate">{item.title}</h4>
                                <div className="flex-1 overflow-hidden">
                                    <div className="space-y-0.5">
                                        {item.ideas.filter(i => i.isSelected).slice(0, 2).map(i => (
                                            <div key={i.id} className="text-[9px] font-bold text-gray-800 truncate px-1 bg-white/50 rounded-sm">ÔÇó {i.text}</div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className={`shrink-0 ${[SectionKey.PESTLE, SectionKey.PORTERS, SectionKey.MARKETING, SectionKey.SWOT].includes(section) ? '' : 'mb-12'}`}>
                <div className="flex items-center gap-4 mb-4">
                    <span className="px-4 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-100 shadow-sm animate-pulse">Live Strategy Session</span>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Project ID: {project.id}</span>
                </div>
                <h2 className="text-5xl font-black text-gray-900 tracking-tight uppercase leading-none shadow-sm inline-block break-words max-w-full">{project.name}</h2>
                <div className="mt-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                        <i className={`fas ${currentSection?.icon}`} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{currentSection?.label}</h3>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white rounded-[40px] p-8 md:p-12 border border-gray-100 shadow-xl shadow-indigo-100/20 mb-8 custom-scrollbar mt-8">
                {section === SectionKey.OVERVIEW && <OverviewSection project={project} setActiveSection={setActiveSection} />}
                {section === SectionKey.ABOUT && <AboutBusinessSection project={project} updateActiveProject={updateActiveProject} handleFileUpload={handleFileUpload} setActiveSection={setActiveSection} />}
                {[SectionKey.PESTLE, SectionKey.PORTERS, SectionKey.MARKETING, SectionKey.SWOT].includes(section) && (
                    <FrameworkSection
                        sectionKey={section}
                        project={project}
                        updateActiveProject={updateActiveProject}
                        generateIdeas={generateIdeas}
                        isGenerating={isGenerating}
                        setActiveSection={setActiveSection}
                    />
                )}
            </div>
        </div>
    );
}

function OverviewSection({ project, setActiveSection }: { project: ProjectState, setActiveSection: (s: SectionKey) => void }) {
    return (
        <div className="animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SECTIONS.filter(s => ![SectionKey.PROJECT_LIST, SectionKey.OVERVIEW].includes(s.key)).map(s => {
                    const frameworks = project.frameworks[s.key] || [];
                    const isComplete = s.key === SectionKey.ABOUT
                        ? (project.businessDetails?.length || 0) > 50
                        : frameworks.length > 0 && frameworks.every(f => f.ideas.some(i => i.isSelected));

                    return (
                        <div key={s.key} className="p-8 bg-gray-50/50 rounded-3xl border border-gray-100 hover:border-indigo-200 transition-all hover:bg-white hover:shadow-xl hover:shadow-indigo-100/30 group">
                            <div className="flex justify-between items-start mb-6">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm border border-gray-50 group-hover:scale-110 transition-transform">
                                    <i className={`fas ${s.icon} text-lg`} />
                                </div>
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {isComplete ? 'Complete' : 'Pending'}
                                </span>
                            </div>
                            <h4 className="text-xl font-black text-gray-900 mb-2">{s.label}</h4>
                            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-6">Analyze and strategize</p>
                            <button
                                onClick={() => setActiveSection(s.key)}
                                className="w-full py-3 bg-white border border-indigo-100 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                            >
                                Open Analysis
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function AboutBusinessSection({ project, updateActiveProject, handleFileUpload, setActiveSection }: {
    project: ProjectState,
    updateActiveProject: (u: (p: ProjectState) => ProjectState) => void,
    handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void,
    setActiveSection: (s: SectionKey) => void
}) {
    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 px-2">Business Vision & Context</h4>
                <textarea
                    className="w-full h-80 p-8 bg-gray-50 border border-gray-100 rounded-[40px] focus:bg-white focus:border-indigo-500 transition-all outline-none text-lg font-bold text-gray-700 placeholder:text-gray-300 shadow-inner"
                    placeholder="e.g. We are a boutique digital marketing agency focusing on high-end luxury brands in the UK..."
                    value={project.businessDetails}
                    onChange={(e) => updateActiveProject(prev => ({ ...prev, businessDetails: e.target.value }))}
                />
            </div>

            <div>
                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 px-2">Knowledge Base (Documents)</h4>
                <div className="border-4 border-dashed border-gray-50 rounded-[40px] p-16 text-center hover:border-indigo-200 transition-all cursor-pointer relative group bg-gray-50/50">
                    <input type="file" multiple accept=".html,.txt,.pdf" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                    <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-indigo-200 mx-auto mb-6 shadow-sm group-hover:scale-110 group-hover:text-indigo-400 transition-all">
                        <i className="fas fa-file-upload text-3xl" />
                    </div>
                    <p className="text-gray-500 font-bold text-lg mb-2">Drag & Drop Strategy Docs</p>
                    <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Supports TXT, HTML (Max 5000 chars each)</p>
                </div>

                {project.businessFiles.length > 0 && (
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {project.businessFiles.map(file => (
                            <div key={file.id} className="p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:shadow-md transition-all group">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-3">
                                        <i className="fas fa-file-lines text-indigo-400" />
                                        <span className="font-bold text-gray-700">{file.name}</span>
                                    </div>
                                    <button
                                        onClick={() => updateActiveProject(prev => ({ ...prev, businessFiles: prev.businessFiles.filter(f => f.id !== file.id) }))}
                                        className="w-8 h-8 rounded-full bg-red-50 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center"
                                    >
                                        <i className="fas fa-times" />
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 truncate italic">"{file.content.substring(0, 100)}..."</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex justify-end pt-10">
                <button
                    onClick={() => setActiveSection(SectionKey.PESTLE)}
                    className="px-10 py-5 bg-indigo-600 text-white rounded-[24px] font-black shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-4 group"
                >
                    <span className="uppercase tracking-widest text-xs">Start PESTLE Analysis</span>
                    <i className="fas fa-arrow-right group-hover:translate-x-2 transition-transform" />
                </button>
            </div>
        </div>
    );
}

function FrameworkSection({ sectionKey, project, updateActiveProject, generateIdeas, isGenerating, setActiveSection }: {
    sectionKey: SectionKey,
    project: ProjectState,
    updateActiveProject: (u: (p: ProjectState) => ProjectState) => void,
    generateIdeas: (k: string, i: string, p?: string) => void,
    isGenerating: boolean,
    setActiveSection: (s: SectionKey) => void
}) {
    const items = project.frameworks[sectionKey] || [];
    const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});

    const handleAddIdea = (itemId: string) => {
        const text = newItemTexts[itemId]?.trim();
        if (!text) return;

        updateActiveProject(prev => {
            const fws = { ...prev.frameworks };
            const list = [...(fws[sectionKey] || [])];
            const idx = list.findIndex(i => i.id === itemId);
            if (idx === -1) return prev;

            const newIdea: Idea = {
                id: Math.random().toString(36).substring(2, 9),
                text,
                isAiGenerated: false,
                isSelected: true,
                order: list[idx].ideas.length
            };

            list[idx] = { ...list[idx], ideas: [...list[idx].ideas, newIdea] };
            fws[sectionKey] = list;
            return { ...prev, frameworks: fws };
        });

        setNewItemTexts(prev => ({ ...prev, [itemId]: "" }));
    };

    const toggleIdea = (itemId: string, ideaId: string) => {
        updateActiveProject(prev => {
            const fws = { ...prev.frameworks };
            const list = [...(fws[sectionKey] || [])];
            const idx = list.findIndex(i => i.id === itemId);
            if (idx === -1) return prev;

            const updatedIdeas = list[idx].ideas.map(i => i.id === ideaId ? { ...i, isSelected: !i.isSelected } : i);
            list[idx] = { ...list[idx], ideas: updatedIdeas };
            fws[sectionKey] = list;
            return { ...prev, frameworks: fws };
        });
    };

    const deleteIdea = (itemId: string, ideaId: string) => {
        updateActiveProject(prev => {
            const fws = { ...prev.frameworks };
            const list = [...(fws[sectionKey] || [])];
            const idx = list.findIndex(i => i.id === itemId);
            if (idx === -1) return prev;

            list[idx] = { ...list[idx], ideas: list[idx].ideas.filter(i => i.id !== ideaId) };
            fws[sectionKey] = list;
            return { ...prev, frameworks: fws };
        });
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {items.map(item => (
                <div key={item.id} className="bg-gray-50/50 rounded-[40px] border border-gray-100 overflow-hidden group hover:bg-white hover:shadow-2xl transition-all duration-500">
                    <div className="h-2 w-full" style={{ backgroundColor: item.color }} />
                    <div className="p-8 md:p-10">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-3xl font-black text-gray-900 tracking-tight mb-2 uppercase">{item.title}</h3>
                                <p className="text-gray-500 text-sm font-medium">Explore strategic factors and capture actionable insights.</p>
                            </div>
                            <button
                                onClick={() => generateIdeas(sectionKey, item.id)}
                                disabled={isGenerating}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                <i className={`fas fa-sparkles ${isGenerating ? 'animate-spin' : ''}`} />
                                {isGenerating ? 'Analysing...' : 'AI Suggestions'}
                            </button>
                        </div>

                        <div className="flex gap-4 mb-8">
                            <input
                                type="text"
                                value={newItemTexts[item.id] || ""}
                                onChange={(e) => setNewItemTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddIdea(item.id)}
                                placeholder="Add custom strategy point..."
                                className="flex-1 px-8 py-5 bg-white border border-gray-100 rounded-3xl outline-none focus:border-indigo-500 transition-all font-bold text-gray-700 shadow-sm"
                            />
                            <button
                                onClick={() => handleAddIdea(item.id)}
                                className="px-8 bg-white border border-gray-100 text-indigo-600 rounded-3xl font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                            >
                                <i className="fas fa-plus" />
                            </button>
                        </div>

                        <div className="space-y-3 mb-8">
                            {item.ideas.length === 0 && (
                                <div className="py-12 text-center text-gray-300 italic font-medium p-4 border-2 border-dashed border-gray-100 rounded-3xl">
                                    No items added yet. Use AI or add manually.
                                </div>
                            )}
                            {item.ideas.map(idea => (
                                <div key={idea.id} className={`flex items-center gap-4 p-5 rounded-[24px] border transition-all ${idea.isSelected ? 'bg-white border-indigo-100 shadow-lg shadow-indigo-100/50' : 'bg-transparent border-transparent'}`}>
                                    <button
                                        onClick={() => toggleIdea(item.id, idea.id)}
                                        className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${idea.isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-300'}`}
                                    >
                                        <i className="fas fa-check font-black" />
                                    </button>
                                    <span className={`flex-1 font-bold ${idea.isSelected ? 'text-gray-900' : 'text-gray-400'}`}>
                                        {idea.text}
                                        {idea.isAiGenerated && <span className="ml-2 text-[8px] px-2 py-0.5 bg-indigo-50 text-indigo-400 rounded-full font-black uppercase">AI</span>}
                                    </span>
                                    <button
                                        onClick={() => deleteIdea(item.id, idea.id)}
                                        className="w-8 h-8 rounded-full text-gray-200 hover:text-red-500 transition-all"
                                    >
                                        <i className="fas fa-trash-alt text-xs" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="pt-8 border-t border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 block">Section Justification</label>
                            <textarea
                                value={item.justification}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    updateActiveProject(prev => {
                                        const fws = { ...prev.frameworks };
                                        const list = [...(fws[sectionKey] || [])];
                                        const idx = list.findIndex(i => i.id === item.id);
                                        if (idx === -1) return prev;
                                        list[idx] = { ...list[idx], justification: val };
                                        fws[sectionKey] = list;
                                        return { ...prev, frameworks: fws };
                                    });
                                }}
                                className="w-full h-32 p-6 bg-white border border-gray-100 rounded-3xl outline-none focus:border-indigo-500 transition-all font-bold text-gray-700 text-sm shadow-sm"
                                placeholder="Explain why these choices were made..."
                            />
                        </div>
                    </div>
                </div>
            ))}

            <div className="flex justify-center pt-10">
                <button
                    onClick={() => {
                        const keys = [SectionKey.PESTLE, SectionKey.PORTERS, SectionKey.MARKETING, SectionKey.SWOT];
                        const currentIdx = keys.indexOf(sectionKey);
                        if (currentIdx < keys.length - 1) {
                            setActiveSection(keys[currentIdx + 1]);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        } else {
                            setActiveSection(SectionKey.OVERVIEW);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    }}
                    className="px-14 py-5 bg-indigo-600 text-white rounded-[24px] font-black shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-4 group"
                >
                    <span className="uppercase tracking-widest text-xs">Continue Roadmap</span>
                    <i className="fas fa-arrow-right group-hover:translate-x-2 transition-transform" />
                </button>
            </div>
        </div>
    );
}
