/**
 * Express Backend Server for StrategySuite
 * 
 * All sensitive API keys are stored server-side only.
 * The frontend calls these API endpoints instead of using keys directly.
 * Build Trigger: 2026-02-07T11:20:00Z
 */

import express from 'express';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Enable Gzip compression
app.use(compression());

// Increase limit for large project objects (default is 100kb)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Log all incoming requests for debugging
app.use((req, res, next) => {
    console.log(`📡 [Request] ${req.method} ${req.url}`);
    if (req.method === 'POST') {
        console.log(`   └─ Body Size: ${JSON.stringify(req.body).length} chars`);
    }
    next();
});

// Initialize Gemini with server-side API key (never exposed to client)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
let genAI = null;

if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ Gemini AI initialized');
} else {
    console.warn('⚠️ GEMINI_API_KEY not set - AI features disabled');
}

// Initialize Firebase Admin for server-side Firestore access
const PROJECT_ID = (process.env.VITE_FIREBASE_PROJECT_ID || 'southhampshirecollege').trim();

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            projectId: PROJECT_ID
        });
        console.log(`✅ Firebase Admin initialized for project: ${PROJECT_ID}`);
    }
} catch (error) {
    console.error('❌ Firebase Admin init error:', error);
}

const db = admin.firestore();
console.log(`Process ID: ${process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'Not set'}`);
console.log('------------------------------------------');

// ============================================
// API Routes
// ============================================

/**
 * POST /api/v1/generate-ideas
 * 
 * Generates strategic ideas using Gemini AI.
 * All AI processing happens server-side.
 */
app.post('/api/v1/generate-ideas', async (req, res) => {
    if (!genAI) {
        return res.status(503).json({
            error: 'AI service not configured',
            message: 'GEMINI_API_KEY environment variable not set'
        });
    }

    try {
        const { frameworkKey, itemTitle, businessContext, promptOverride } = req.body;

        if (!frameworkKey || !itemTitle) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'frameworkKey and itemTitle are required'
            });
        }

        const prompt = `
            You are a world-class strategic consultant.
            Propose 3 distinct ideas for the "${itemTitle}" category of a ${frameworkKey.toUpperCase()} framework.
            
            CONTEXT:
            ${businessContext || 'No additional context provided.'}
            ${promptOverride ? `SPECIFIC FOCUS: ${promptOverride}` : ''}
            
            CONSTRAINTS:
            - UK English spelling ONLY (e.g., 'organise', 'specialised', 'analysing').
            - MAXIMUM 7 words per idea.
            - Exactly 3 ideas.
            - Professional, specific, and actionable.
            - RETURN AS A JSON ARRAY OF STRINGS: ["idea1", "idea2", "idea3"]
        `;

        const model = genAI.getGenerativeModel({
            model: 'gemini-3-flash-preview',
            generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const ideas = JSON.parse(text);

        res.json({ ideas });
    } catch (error) {
        console.error('AI generation error:', error);
        res.status(500).json({
            error: 'AI generation failed',
            message: error.message
        });
    }
});

/**
 * GET /api/v1/projects/:userId
 * 
 * Fetches all projects for a specific user.
 */
app.get('/api/v1/projects/:userId', async (req, res) => {
    const { userId } = req.params;
    console.log(`📦 [Server] Fetching projects for user: ${userId}`);

    try {
        const projectsRef = db.collection('users').doc(userId).collection('projects');
        console.log(`🔍 [Server] Querying: ${projectsRef.path} in Project: ${db._settings.projectId}`);
        const snapshot = await projectsRef.get();

        const projects = [];
        snapshot.forEach(doc => {
            projects.push(doc.data());
        });

        // Sort by lastUpdated descending (newest first)
        projects.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

        console.log(`✅ [Server] Loaded ${projects.length} projects for ${userId} (Project: ${db._settings.projectId})`);
        if (projects.length > 0) {
            console.log(`👉 [Server] Example project titles: ${projects.slice(0, 3).map(p => p.title || 'Untitled').join(', ')}`);
            console.log(`👉 [Server] Example project ID: ${projects[0].id}`);
        }
        res.json({
            projects,
            metadata: {
                projectId: db._settings.projectId || PROJECT_ID,
                database: '(default)'
            }
        });
    } catch (error) {
        console.error('❌ [Server] Error loading projects:', error);
        res.status(500).json({ error: 'Failed to load projects', message: error.message });
    }
});

/**
 * POST /api/v1/projects/:userId
 * 
 * Saves or updates a project for a specific user.
 */
app.post('/api/v1/projects/:userId', async (req, res) => {
    const { userId } = req.params;
    const project = req.body;

    if (!project || !project.id) {
        return res.status(400).json({ error: 'Missing project data or ID' });
    }

    console.log(`📦 [Server] Saving project ${project.id} ("${project.name}") for user: ${userId}`);

    try {
        // Ensure the parent user document exists for better visibility in Firestore Console
        const userRef = db.collection('users').doc(userId);
        await userRef.set({
            lastUpdated: new Date().toISOString(),
            uid: userId
        }, { merge: true });

        const projectRef = userRef.collection('projects').doc(project.id);
        const result = await projectRef.set(project, { merge: true });

        console.log(`✅ [Server] Project ${project.id} saved successfully to path: ${projectRef.path}`);
        res.json({
            success: true,
            metadata: {
                projectId: db._settings.projectId || PROJECT_ID,
                path: projectRef.path,
                writeTime: result.writeTime
            }
        });
    } catch (error) {
        console.error('❌ [Server] Firestore Save Error Stack:', error.stack);
        console.error('❌ [Server] Firestore Save Error Message:', error.message);
        res.status(500).json({ error: 'Failed to save project', message: error.message });
    }
});

/**
 * DELETE /api/v1/projects/:userId/:projectId
 * 
 * Deletes a project for a specific user.
 */
app.delete('/api/v1/projects/:userId/:projectId', async (req, res) => {
    const { userId, projectId } = req.params;
    console.log(`📦 [Server] Deleting project ${projectId} for user: ${userId}`);

    try {
        const projectRef = db.collection('users').doc(userId).collection('projects').doc(projectId);
        await projectRef.delete();

        console.log(`✅ [Server] Project ${projectId} deleted successfully`);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ [Server] Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project', message: error.message });
    }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        aiEnabled: !!genAI,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// Static File Serving (Production)
// ============================================

// Serve static files from the dist directory with long-term caching for assets
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath, {
    maxAge: '1y',
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            // Don't cache HTML files so we always serve the latest bundle version
            res.setHeader('Cache-Control', 'public, max-age=0');
        }
    }
}));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================
// Server Start
// ============================================

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📁 Serving static files from: ${distPath}`);
    console.log(`🔐 AI Features: ${genAI ? 'Enabled' : 'Disabled (no API key)'}`);
});
