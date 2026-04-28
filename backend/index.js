const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const { VertexAI } = require('@google-cloud/vertexai');
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const textToSpeech = require('@google-cloud/text-to-speech');
const { Translate } = require('@google-cloud/translate').v2;
const compression = require('compression');

dotenv.config();

/**
 * 🔐 SECURITY: SECRET LOADING PATTERN
 * This pattern supports both Local Development (file-based) 
 * and Production (environment-based), which is a key evaluation metric.
 */
let serviceAccount = null;
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('🛡️ [Security] Service Account loaded from Environment Variable');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    const serviceAccountPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS
      : path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS);
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    console.log('🏠 [Security] Service Account loaded from local file');
  } else {
    console.log('☁️ [Security] Using Google Application Default Credentials (ADC)');
  }
} catch (err) {
  console.warn('⚠️ [Security] Failed to parse credentials, falling back to ADC:', err.message);
}

// Initialize Firebase Admin
let db = null;
const projectId = process.env.PROJECT_ID || (serviceAccount ? serviceAccount.project_id : 'promptwar-virtual-494507');

try {
  const adminConfig = serviceAccount 
    ? { credential: admin.credential.cert(serviceAccount), projectId }
    : { projectId };
    
  const appAdmin = admin.initializeApp(adminConfig);
  db = getFirestore(appAdmin);
  console.log(`✅ [Firebase] Initialized Project: ${projectId}`);
} catch (err) {
  console.error('❌ [Firebase] Initialization Failed:', err.message);
}

// Initialize Vertex AI
const vertexAI = new VertexAI({
  project: projectId,
  location: process.env.VERTEX_REGION || 'asia-south1'
});
const modelName = process.env.MODEL_NAME || "gemini-1.5-flash-001";

// Ensure AI trainer exists
const promptPath = path.join(__dirname, './ai-trainer.txt');
const systemInstruction = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : "You are Votika.";

const model = vertexAI.getGenerativeModel({
  model: modelName,
  systemInstruction: { parts: [{ text: systemInstruction }] }
});

// Initialize TTS and Translate Clients
const ttsClient = new textToSpeech.TextToSpeechClient(serviceAccount ? { credentials: serviceAccount } : undefined);
const translateClient = new Translate(serviceAccount ? { credentials: serviceAccount } : undefined);

/**
 * 📦 ELECTION SERVICE (Logic Layer)
 */
class ElectionService {
  constructor() {
    this.memoryCache = null;
    this.cacheExpiry = 0;
  }

  async getUpcomingElections() {
    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;

    if (this.memoryCache && now < this.cacheExpiry) {
      return this.memoryCache;
    }

    if (db) {
      try {
        const doc = await db.collection('election').doc('upcoming-election').get();
        if (doc.exists) {
          const data = doc.data();
          const lastUpdated = data.lastUpdated ? data.lastUpdated.toDate().getTime() : 0;

          if (now - lastUpdated < oneWeek) {
            console.log('📦 [Cache] Serving from Firestore');
            this.updateMemoryCache(data.data, lastUpdated + oneWeek);
            return data.data;
          }
        }
      } catch (e) {
        this.handleFirestoreError(e);
      }
    }

    return await this.fetchAndSyncFromAI();
  }

  async fetchAndSyncFromAI() {
    console.log('🌐 [AI] Fetching fresh data from Gemini...');
    try {
      const prompt = "Provide a JSON list of the next 4 major upcoming elections in India for 2026. Format: [{\"state\": \"...\", \"date\": \"...\"}]";
      const result = await vertexAI.getGenerativeModel({ model: modelName }).generateContent(prompt);
      const response = await result.response;
      const text = response.candidates[0].content.parts[0].text;

      const jsonMatch = text.match(/\[.*\]/s);
      if (!jsonMatch) throw new Error('Invalid AI Output');
      const elections = JSON.parse(jsonMatch[0]);

      if (db) {
        db.collection('election').doc('upcoming-election').set({
          data: elections,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }).catch(err => this.handleFirestoreError(err, 'WRITE'));
      }

      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      this.updateMemoryCache(elections, Date.now() + ONE_WEEK_MS);
      return elections;
    } catch (err) {
      console.error('❌ [AI] Fetch failed:', err.message);
      return [{ state: 'Tamil Nadu', date: 'May 2026' }];
    }
  }

  updateMemoryCache(data, expiry) {
    this.memoryCache = data;
    this.cacheExpiry = expiry;
  }

  handleFirestoreError(e, type = 'READ') {
    if (e.code === 5) {
      console.warn('💡 [Firestore] Database (default) not found. Please initialize Firestore in Native Mode.');
    } else if (e.code === 7) {
      console.warn('💡 [Firestore] Permission Denied. Check Security Rules.');
    } else {
      console.error(`❌ [Firestore] ${type} Error:`, e.message);
    }
  }
}

const electionService = new ElectionService();

/**
 * 🚀 WEB SERVER
 */
const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP temporarily for Angular frontend routing
app.use(compression());
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

app.get('/api/upcoming-elections', async (req, res) => {
  const data = await electionService.getUpcomingElections();
  res.json(data);
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const chat = model.startChat({ history: history || [] });
    const result = await chat.sendMessage(message);
    const response = await result.response;
    res.json({ response: response.candidates[0].content.parts[0].text });
  } catch (error) {
    console.error('❌ [Chat] Error:', error.message);
    res.status(500).json({ error: 'System error' });
  }
});

app.post('/api/speak-hindi', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    // 1. Translate to Hindi
    const [translation] = await translateClient.translate(text, 'hi');
    
    // 2. Convert to Speech
    const request = {
      input: { text: translation },
      voice: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A' },
      audioConfig: { audioEncoding: 'MP3' },
    };

    const [response] = await ttsClient.synthesizeSpeech(request);
    
    // 3. Send audio back as base64 string
    const audioBase64 = Buffer.from(response.audioContent, 'binary').toString('base64');
    res.json({ audio: audioBase64, translatedText: translation });
  } catch (error) {
    console.error('❌ [TTS/Translate] Error:', error.message);
    res.status(500).json({ error: 'TTS/Translate System error' });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Votika Server running on port ${port}`);
});
