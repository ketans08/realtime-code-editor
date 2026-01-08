import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState('javascript');
    const [inputText, setInputText] = useState('');
    const [outputText, setOutputText] = useState('');
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                }
            );

            // Listening for disconnected
            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
        };
        init();
        return () => {
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
        };
    }, []);

    // Handle language change
    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language: newLanguage }) => {
                setLanguage(newLanguage);
            });
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
            }
        };
    }, [socketRef.current]);

    // Broadcast language changes to other users
    const handleLanguageChange = (newLanguage) => {
        setLanguage(newLanguage);
        if (socketRef.current) {
            socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
                roomId,
                language: newLanguage,
            });
        }
    };

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    // Run code handler (basic JS execution in sandboxed iframe)
    const runCode = async () => {
        const code = codeRef.current || '';
        setOutputText('');
        if (!code) {
            setOutputText('No code to run.');
            return;
        }

        if (language === 'cpp' || language === 'c++') {
            setIsRunning(true);
            setOutputText('Submitting to Piston runner (or falling back to local runner)...\n');
            const backend = process.env.REACT_APP_BACKEND_URL || '';

            // helper to post and capture detailed info
            async function doPost(url, body) {
                const details = { url, request: body, status: null, ok: false, json: null, text: null, error: null };
                try {
                    console.log('Posting to', url, 'payload:', body);
                    const resp = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                    });
                    details.status = resp.status;
                    details.ok = resp.ok;
                    try { details.json = await resp.clone().json(); } catch (e) { details.json = null; }
                    try { details.text = await resp.clone().text(); } catch (e) { details.text = null; }
                    return details;
                } catch (err) {
                    details.error = String(err);
                    console.error('Request failed', url, err);
                    return details;
                }
            }

            try {
                const pistonUrl = `${backend}/run-piston`;
                const tryPiston = await doPost(pistonUrl, { language, code, input: inputText });
                console.log('Piston response details:', tryPiston);

                if (tryPiston.error || !tryPiston.ok) {
                    setOutputText((prev) => prev + `Piston request failed: ${tryPiston.error || 'status=' + tryPiston.status} -- falling back to local runner...\n`);
                    const local = await doPost(`${backend}/run`, { language: 'cpp', code, input: inputText });
                    console.log('Local runner response details:', local);
                    if (local.error) {
                        setOutputText((prev) => prev + 'Local runner network error: ' + local.error + '\n');
                    } else if (local.json) {
                        const d = local.json;
                        if (d.compileError) setOutputText((prev) => prev + 'Compilation Error:\n' + d.compileError + '\n');
                        else if (d.error) setOutputText((prev) => prev + 'Error: ' + d.error + '\n');
                        else setOutputText((prev) => prev + (d.stdout || '') + (d.stderr ? '\n' + d.stderr : ''));
                    } else {
                        setOutputText((prev) => prev + 'Local runner returned non-JSON response: ' + (local.text || '') + '\n');
                    }
                } else if (tryPiston.json) {
                    // Piston returned ok - print normalized response
                    const data = tryPiston.json;
                    console.log('Piston execution result:', data);
                    console.log('stdout repr:', JSON.stringify(data.stdout), 'length:', data.stdout?.length);
                    console.log('stderr repr:', JSON.stringify(data.stderr), 'length:', data.stderr?.length);
                    if (data.success === false) {
                        const errorOutput = 'Execution Error:\n' + data.stderr + '\n';
                        console.log('Setting error output:', JSON.stringify(errorOutput));
                        setOutputText((prev) => prev + errorOutput);
                    } else {
                        const stdout = data.stdout || '';
                        const stderr = data.stderr ? '\n' + data.stderr : '';
                        const fullOutput = stdout + stderr;
                        console.log('Setting success output:', JSON.stringify(fullOutput));
                        setOutputText((prev) => {
                            const newVal = prev + fullOutput;
                            console.log('Output state after append:', JSON.stringify(newVal));
                            return newVal;
                        });
                    }
                } else {
                    setOutputText((prev) => prev + 'Piston returned non-JSON response: ' + (tryPiston.text || '') + '\n');
                }
            } catch (err) {
                setOutputText((prev) => prev + 'Unexpected error: ' + String(err) + '\n');
            } finally {
                setIsRunning(false);
            }
            return;
        }

        if (language !== 'javascript') {
            setOutputText(
                'Execution for this language is not supported in-browser. Use a server-side runner.'
            );
            return;
        }

        setIsRunning(true);

        // Prepare input lines
        const inputLines = inputText ? inputText.split('\n') : [];

        // Create sandboxed iframe
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.sandbox = 'allow-scripts';

        // Safety timeout to avoid stuck running state
        const timeoutMs = 8000;
        let timeoutId = null;

        // build iframe content
        const escapedInput = JSON.stringify(inputLines);

        const wrapped = `
            <script>
                (function(){
                    const input = ${escapedInput};
                    let idx = 0;
                    function readLine(){ return input[idx++] || ''; }
                    function safePost(type, payload){ parent.postMessage({type, payload}, '*'); }
                    console.log = function(){
                        var args = Array.prototype.slice.call(arguments).map(a => {
                            try { return JSON.stringify(a); } catch(e){ return String(a); }
                        }).join(' ');
                        safePost('log', args);
                    }
                    try {
                        this.readLine = readLine;
                        // user code
                        ${code}
                        safePost('done', '');
                    } catch (err) {
                        safePost('error', err && err.stack ? err.stack : String(err));
                    }
                })();
            <\/script>
        `;

        // Listener for messages from iframe
        function handleMessage(e) {
            // Ensure message comes from our iframe
            if (!e || !e.source || e.source !== iframe.contentWindow) return;
            const data = e.data;
            if (!data || typeof data !== 'object') return;
            if (data.type === 'log') {
                setOutputText((prev) => prev + data.payload + '\n');
            } else if (data.type === 'error') {
                setOutputText((prev) => prev + 'Error: ' + data.payload + '\n');
                cleanupFinal();
            } else if (data.type === 'done') {
                cleanupFinal();
            }
        }

        // cleanup function
        const cleanupFinal = (reason) => {
            try { window.removeEventListener('message', handleMessage); } catch (e) { }
            try { if (iframe && iframe.parentNode) document.body.removeChild(iframe); } catch (e) { }
            if (timeoutId) clearTimeout(timeoutId);
            setIsRunning(false);
            if (reason) setOutputText((prev) => prev + reason + '\n');
        };

        window.addEventListener('message', handleMessage);
        iframe.srcdoc = wrapped;
        document.body.appendChild(iframe);

        timeoutId = setTimeout(() => {
            cleanupFinal('Execution timed out.');
        }, timeoutMs);
    };

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/code-sync.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <div className="languageSelector">
                    <label htmlFor="language">Language: </label>
                    <select
                        id="language"
                        value={language}
                        onChange={(e) => handleLanguageChange(e.target.value)}
                        className="languageDropdown"
                    >
                        <option value="javascript">JavaScript</option>
                        <option value="python">Python</option>
                        <option value="cpp">C++</option>
                    </select>
                </div>
                <div className="editorControls">
                    <button
                        className="btn runBtn"
                        onClick={async () => {
                            await runCode();
                        }}
                        disabled={isRunning}
                    >
                        {isRunning ? 'Running...' : 'Run'}
                    </button>
                    <button
                        className="btn clearOutput"
                        onClick={() => setOutputText('')}
                    >
                        Clear Output
                    </button>
                </div>
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    language={language}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                />
                <div className="ioPanel">
                    <div className="ioSection">
                        <label>Input</label>
                        <textarea
                            className="ioTextarea"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Provide input lines separated by newlines"
                        />
                    </div>
                    <div className="ioSection">
                        <label>Output</label>
                        <textarea
                            className="outputArea"
                            readOnly
                            value={outputText}
                            placeholder="Program output will appear here"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditorPage;
