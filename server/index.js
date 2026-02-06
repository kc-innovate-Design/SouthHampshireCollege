/**
 * Express Backend Server for StrategySuite
 * 
 * All sensitive API keys are stored server-side only.
 * The frontend calls these API endpoints instead of using keys directly.
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize Gemini with server-side API key (never exposed to client)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
let genAI = null;

if (GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log('✅ Gemini AI initialized');
} else {
    console.warn('⚠️ GEMINI_API_KEY not set - AI features disabled');
}

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

// Serve static files from the dist directory
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

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
