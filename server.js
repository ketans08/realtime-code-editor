const express = require('express');
const app = express();
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const ACTIONS = require('./src/Actions');

// parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Enable CORS for frontend dev and production origins
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        /\.onrender\.com$/,  // Allow any Render domain
        'http://localhost:5001'
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
}));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
            'http://localhost:3000',
            'http://localhost:5000',
            'http://127.0.0.1:3000',
            /\.onrender\.com$/,  // Allow any Render domain
            'http://localhost:5001'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Endpoint to compile and run code (supports C++ server-side execution)
// Always available as fallback when Piston fails
app.post('/run', async (req, res) => {
        console.log('[/run] Local C++ runner called');
        const { language, code, input } = req.body || {};
        if (!language || !code) {
            return res.status(400).json({ error: 'language and code are required' });
        }

        if (language !== 'cpp' && language !== 'c++') {
            return res.status(400).json({ error: 'Only C++ execution is supported server-side for now' });
        }

        const tmpDir = path.join(os.tmpdir(), `runner-${uuidv4()}`);
        try {
            await fs.promises.mkdir(tmpDir, { recursive: true });
            const srcPath = path.join(tmpDir, 'main.cpp');
            const exeName = process.platform === 'win32' ? 'a.exe' : 'a.out';
            const exePath = path.join(tmpDir, exeName);
            await fs.promises.writeFile(srcPath, code, 'utf8');

            // Compile using g++
            const compileCmd = `g++ -std=c++17 -O2 "${srcPath}" -o "${exePath}"`;
            const compilePromise = new Promise((resolve, reject) => {
                exec(compileCmd, { timeout: 10000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                    if (err) return reject({ err, stdout, stderr });
                    resolve({ stdout, stderr });
                });
            });

            try {
                await compilePromise;
            } catch (cErr) {
                // Send compilation errors
                await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
                return res.json({ compileError: cErr.stderr ? String(cErr.stderr) : String(cErr) });
            }

            // Run the executable with timeout
            const runPromise = new Promise((resolve) => {
                const child = exec(`"${exePath}"`, { cwd: tmpDir, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
                    resolve({ err, stdout, stderr });
                });

                // feed input if provided
                if (input) {
                    try {
                        child.stdin.write(input);
                        child.stdin.end();
                    } catch (e) { }
                }
            });

            const runResult = await runPromise;
            await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => { });
            return res.json({ stdout: runResult.stdout || '', stderr: runResult.stderr || '' });
        } catch (err) {
            try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch (e) { }
            return res.status(500).json({ error: String(err) });
        }
    });

// Helper: call Piston (emkc.org) to execute code
async function callPiston(language, codeOrFiles, input, version) {
    const langKey = (language || '').toLowerCase();
    // If caller passed full files array, use it directly
    let filesPayload = null;
    if (Array.isArray(codeOrFiles)) {
        filesPayload = codeOrFiles;
    } else if (typeof codeOrFiles === 'string') {
        // basic file name and language mapping
        const map = {
            cpp: { file: 'main.cpp', version: '10.2.0' },
            'c++': { file: 'main.cpp', version: '10.2.0' },
            javascript: { file: 'main.js' },
            nodejs: { file: 'main.js' },
            python: { file: 'main.py' },
            py: { file: 'main.py' },
            java: { file: 'Main.java' },
            c: { file: 'main.c' }
        };
        const entry = map[langKey] || { file: 'main.txt' };
        filesPayload = [{ name: entry.file, content: codeOrFiles }];
        // allow version override from caller
        if (!version && entry.version) version = entry.version;
    } else {
        throw new Error('Invalid code/files payload for Piston');
    }

    const payload = {
        language: langKey || 'text',
        version: version || 'latest',
        files: filesPayload,
        stdin: input || ''
    };

    const pistonUrl = 'https://emkc.org/api/v2/piston/execute';
    const resp = await fetch(pistonUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Piston returned ${resp.status}: ${txt}`);
    }

    return resp.json();
}

// Normalize escaped newlines in code strings for Piston compatibility
// Converts literal "\n" (two chars) into real newlines (LF), and similar for "\r\n", "\r", "\t"
function normalizeCodeString(s) {
    if (typeof s !== 'string') return s;
    return s
        .replace(/\\r\\n/g, '\r\n')   // literal "\r\n" -> CRLF
        .replace(/\\n/g, '\n')       // literal "\n" -> LF
        .replace(/\\r/g, '\r')       // literal "\r" -> CR
        .replace(/\\t/g, '\t');      // literal "\t" -> TAB
}

// Normalize execution responses from various engines to a common shape
function normalizeExecution(engine, raw) {
    const out = { engine, success: false, stdout: '', stderr: '', exitCode: null, raw };

    if (!raw) return out;

    // Piston shape
    if (raw.run || raw.compile) {
        const run = raw.run || {};
        const compile = raw.compile || {};
        out.stdout = (run.stdout || compile.stdout || '') + '';
        out.stderr = (run.stderr || run.output || compile.stderr || compile.output || '') + '';
        out.exitCode = (run.code != null ? run.code : (compile.code != null ? compile.code : null));
        out.success = out.exitCode === 0;
        return out;
    }

    // Generic fallback: try to stringify
    try {
        out.stdout = JSON.stringify(raw);
    } catch (e) { out.stdout = String(raw); }
    return out;
}

// Expose a direct Piston endpoint
app.post('/run-piston', async (req, res) => {    console.log('[/run-piston] Piston endpoint called');    const { language, code, files, input } = req.body || {};
    let version = req.body?.version || null; // allow mutation for default assignment
    
    if (!language || (!code && !files)) return res.status(400).json({ error: 'language and code/files required' });

    try {
        let filesPayload;

        if (Array.isArray(files)) {
            // Frontend sent files array; normalize each file's content
            filesPayload = files.map(f => ({
                name: f.name || 'main.txt',
                content: normalizeCodeString(f.content)
            }));
        } else if (typeof code === 'string') {
            // Frontend sent single code string; normalize and wrap in files[]
            const langKey = (language || '').toLowerCase();
            const filename =
                langKey.includes('cpp') || langKey.includes('c++') ? 'main.cpp' :
                    langKey.includes('py') ? 'main.py' :
                        langKey.includes('java') ? 'Main.java' :
                            langKey.includes('javascript') || langKey.includes('node') ? 'main.js' :
                                'main.txt';
            filesPayload = [{ name: filename, content: normalizeCodeString(code) }];
        } else {
            return res.status(400).json({ error: 'code must be string or files must be array' });
        }

        // ensure piston uses a concrete runtime version for some languages (e.g. cpp)
        const langKey = (language || '').toLowerCase().replace('c++', 'cpp');
        if (!version) {
            // default versions for languages that don't accept 'latest'
            const defaultVersions = {
                cpp: '10.2.0',
                'c++': '10.2.0',
                python: '3.10.0',
                javascript: '18.15.0',
                nodejs: '18.15.0'
            };
            version = defaultVersions[langKey] || 'latest';
        }

        const pistonPayload = {
            language: langKey || 'text',
            version,
            files: filesPayload,
            stdin: input || ''
        };

        console.log('Sending to Piston:', JSON.stringify(pistonPayload, null, 2));
        const result = await callPiston(langKey, filesPayload, input, version);
        const normalized = normalizeExecution('piston', result);
        return res.json(normalized);
    } catch (err) {
        console.error('Piston execution failed:', err);
        return res.status(500).json({ error: String(err) });
    }
});

// Serve static build (React)
// Serve static build only if it exists (avoids ENOENT noise during development)
const buildIndex = path.join(__dirname, 'build', 'index.html');
if (fs.existsSync(buildIndex)) {
    // Serve static files, but skip API routes
    app.use(express.static('build'));
    // SPA fallback: send index.html for non-API routes
    app.use((req, res, next) => {
        // Skip API routes
        if (req.path.startsWith('/run') || req.path.startsWith('/socket.io')) {
            return next();
        }
        res.sendFile(buildIndex);
    });
} else {
    console.log('No build/index.html found — skipping static file serving (development mode)');
}

const userSocketMap = {};
function getAllConnectedClients(roomId) {
    // Map
    return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
        (socketId) => {
            return {
                socketId,
                username: userSocketMap[socketId],
            };
        }
    );
}

io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
        userSocketMap[socket.id] = username;
        socket.join(roomId);
        const clients = getAllConnectedClients(roomId);
        clients.forEach(({ socketId }) => {
            io.to(socketId).emit(ACTIONS.JOINED, {
                clients,
                username,
                socketId: socket.id,
            });
        });
    });

    socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
        socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
        io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    });

    socket.on(ACTIONS.LANGUAGE_CHANGE, ({ roomId, language }) => {
        socket.in(roomId).emit(ACTIONS.LANGUAGE_CHANGE, { language });
    });

    socket.on('disconnecting', () => {
        const rooms = [...socket.rooms];
        rooms.forEach((roomId) => {
            socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
                socketId: socket.id,
                username: userSocketMap[socket.id],
            });
        });
        delete userSocketMap[socket.id];
        socket.leave();
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
