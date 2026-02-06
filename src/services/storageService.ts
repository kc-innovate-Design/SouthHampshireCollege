/**
 * Storage Service for Firebase Firestore
 * 
 * Handles all project data persistence operations.
 * Stores projects under: /users/{userId}/projects/{projectId}
 */

import { db } from '../firebase';
import {
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    writeBatch
} from 'firebase/firestore';
import { ProjectState } from '../../types';

const STORAGE_KEY = 'strategysuite_projects_v1';

/**
 * Load all projects for a user from Firestore
 */
export async function loadProjects(userId: string): Promise<ProjectState[]> {
    console.log('📦 [StorageService] loadProjects called for user:', userId);
    console.log('📦 [StorageService] db object is:', db ? 'INITIALIZED' : 'NULL - Firebase not configured!');

    if (!db) {
        console.warn('[Firestore] Database not initialized');
        return [];
    }

    try {
        const projectsRef = collection(db, 'users', userId, 'projects');
        console.log('[Firestore] Fetching from collection path: users/' + userId + '/projects');

        const startTime = Date.now();
        const snapshot = await getDocs(projectsRef);
        const elapsed = Date.now() - startTime;

        console.log('[Firestore] Loaded', snapshot.size, 'projects in', elapsed, 'ms');

        const projects: ProjectState[] = [];
        snapshot.forEach((doc) => {
            projects.push(doc.data() as ProjectState);
        });

        // Sort by lastUpdated descending (newest first)
        return projects.sort((a, b) => b.lastUpdated - a.lastUpdated);
    } catch (error: any) {
        console.error('[Firestore] Failed to load projects:', error);
        console.error('[Firestore] Error code:', error?.code);
        console.error('[Firestore] Error message:', error?.message);
        return [];
    }
}

/**
 * Save a single project to Firestore
 */
export async function saveProject(userId: string, project: ProjectState): Promise<void> {
    console.log('[Firestore] Saving project:', project.id, 'for user:', userId);
    if (!db) {
        console.warn('[Firestore] Database not initialized, cannot save');
        return;
    }

    try {
        const projectRef = doc(db, 'users', userId, 'projects', project.id);
        console.log('[Firestore] Writing to path: users/' + userId + '/projects/' + project.id);

        const startTime = Date.now();
        await setDoc(projectRef, project);
        const elapsed = Date.now() - startTime;

        console.log('[Firestore] Project saved successfully:', project.id, 'in', elapsed, 'ms');
    } catch (error: any) {
        console.error('[Firestore] Failed to save project:', error);
        console.error('[Firestore] Error code:', error?.code);
        console.error('[Firestore] Error message:', error?.message);
        throw error;
    }
}

/**
 * Save all projects for a user to Firestore (batch operation)
 */
export async function saveAllProjects(userId: string, projects: ProjectState[]): Promise<void> {
    if (!db) {
        console.warn('Firestore not initialized');
        return;
    }

    try {
        const batch = writeBatch(db);

        for (const project of projects) {
            const projectRef = doc(db, 'users', userId, 'projects', project.id);
            batch.set(projectRef, project);
        }

        await batch.commit();
    } catch (error) {
        console.error('Failed to save projects to Firestore:', error);
        throw error;
    }
}

/**
 * Delete a project from Firestore
 */
export async function deleteProject(userId: string, projectId: string): Promise<void> {
    if (!db) {
        console.warn('Firestore not initialized');
        return;
    }

    try {
        const projectRef = doc(db, 'users', userId, 'projects', projectId);
        await deleteDoc(projectRef);
    } catch (error) {
        console.error('Failed to delete project from Firestore:', error);
        throw error;
    }
}

/**
 * Migrate data from localStorage to Firestore (one-time operation)
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

        // Save all local projects to Firestore
        await saveAllProjects(userId, projects);

        // Clear localStorage after successful migration
        localStorage.removeItem(STORAGE_KEY);
        console.log(`✅ Migrated ${projects.length} projects from localStorage to Firestore`);

        return projects;
    } catch (error) {
        console.error('Failed to migrate from localStorage:', error);
        return [];
    }
}
