import { io } from 'socket.io-client';

export const initSocket = async () => {
    const getBackendUrl = () => {
        if (process.env.REACT_APP_BACKEND_URL) return process.env.REACT_APP_BACKEND_URL;
        if (typeof window !== 'undefined' && window.location) return window.location.origin;
        return 'http://localhost:5000';
    };
    const backendUrl = getBackendUrl();

    const options = {
        'force new connection': true,
        reconnectionDelay: 1000,
        reconnection: true,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
    };

    try {
        console.log('Initializing socket to', backendUrl);
        const socket = io(backendUrl, options);

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
        });

        socket.on('connect', () => {
            console.log('Socket connected successfully to:', backendUrl);
        });

        return socket;
    } catch (error) {
        console.error('Failed to initialize socket:', error);
        throw error;
    }
};
