/**
 * Storage Service for Server-Side Proxy
 * 
 * Handles all project data persistence operations by calling the Express backend.
 * The backend handles the actual Firestore interaction.
 */

import { ProjectState } from '../../types';

const STORAGE_KEY = 'strategysuite_projects_v1';

/**
 * Load all projects for a user from the Server Proxy
 */
export async function loadProjects(userId: string): Promise<ProjectState[]> {
    console.log('📦 [StorageService] loadProjects (Proxy) called for user:', userId);

    try {
        const response = await fetch(`/api/v1/projects/${userId}`);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Failed to load projects: ${response.statusText}`);
        }

        const data = await response.json();
        const projects: ProjectState[] = data.projects || [];
        const metadata = data.metadata;

        console.log(`[StorageService] Loaded ${projects.length} projects from project: ${metadata?.projectId || 'unknown'}`);

        return projects;
    } catch (error: any) {
        console.error('[StorageService] Proxy load failed:', error);
        return [];
    }
}

/**
 * Save a single project to the Server Proxy
 */
export async function saveProject(userId: string, project: ProjectState): Promise<void> {
    console.log('[StorageService] Saving project (Proxy):', project.id, 'for user:', userId);

    try {
        const response = await fetch(`/api/v1/projects/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(project),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Failed to save project: ${response.statusText}`);
        }

        const result = await response.json();
        console.log(`[StorageService] Project saved successfully to: ${result.metadata?.projectId} (Path: ${result.metadata?.path})`);
    } catch (error: any) {
        console.error('[StorageService] Proxy save failed:', error);
        throw error;
    }
}

/**
 * Save all projects for a user (sequentially via proxy)
 */
export async function saveAllProjects(userId: string, projects: ProjectState[]): Promise<void> {
    console.log(`[StorageService] Saving ${projects.length} projects via proxy`);

    // For simplicity and to avoid overwhelming the server/firestore, 
    // we save them sequentially or we could implement a batch endpoint later
    for (const project of projects) {
        await saveProject(userId, project);
    }
}

/**
 * Delete a project via the Server Proxy
 */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
    console.log(`[StorageService] Deleting project ${projectId} via proxy`);

    try {
        const response = await fetch(`/api/v1/projects/${userId}/${projectId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Failed to delete project: ${response.statusText}`);
        }

        console.log('[StorageService] Project deleted successfully via proxy');
    } catch (error) {
        console.error('[StorageService] Proxy delete failed:', error);
        throw error;
    }
}

/**
 * Migrate data from localStorage to Firestore via Proxy (one-time operation)
 * Returns the migrated projects or empty array if no migration needed
 */
export async function migrateFromLocalStorage(userId: string): Promise<ProjectState[]> {
    const localData = localStorage.getItem(STORAGE_KEY);

    if (!localData) {
        return [];
    }

    try {
        const projects: ProjectState[] = JSON.parse(localData);

        if (projects.length === 0) {
            return [];
        }

        // Save all local projects to Firestore via Proxy
        await saveAllProjects(userId, projects);

        // Clear localStorage after successful migration
        localStorage.removeItem(STORAGE_KEY);
        console.log(`✅ Migrated ${projects.length} projects from localStorage via Proxy`);

        return projects;
    } catch (error) {
        console.error('Failed to migrate from localStorage:', error);
        return [];
    }
}
