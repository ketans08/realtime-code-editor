import { io } from 'socket.io-client';

export const initSocket = async () => {
    const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

    const options = {
        'force new connection': true,
        reconnectionDelay: 1000,
        reconnection: true,
        reconnectionAttempts: 10,
        transports: ['websocket', 'polling'],
    };

    try {
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
