# Realtime Code Editor

A collaborative, real-time code editor enabling multiple users to edit code simultaneously in the same room. Built with React and Socket.IO for seamless code synchronization.

## 🎯 Key Features

- **Real-time Collaboration** - Multiple users edit simultaneously with instant synchronization
- **Multi-Language Support** - JavaScript, Python, and C++ with syntax highlighting
- **Room-based Sessions** - Create or join editing rooms with unique IDs
- **User Presence** - See who's in the room with display names and avatars
- **Responsive Design** - Works on desktop and mobile devices

## 🛠 Tech Stack

**Frontend:** React 17, Socket.IO Client, CodeMirror, React Router

**Backend:** Node.js, Express, Socket.IO

**Build:** React Scripts, Docker support

## 📦 Installation

### Prerequisites

- Node.js (v12.0.0 or higher)
- npm or yarn

### Setup

```bash
# Clone repository
git clone <repository-url>
cd realtime-code-editor

# Install dependencies
npm install

# Development mode (two terminals)
# Terminal 1: Frontend
npm run start:front

# Terminal 2: Backend
npm run server:dev
```

Open `http://localhost:3000` in your browser.

## 🚀 Usage

1. **Create a Room**: Enter your name and create a new room
2. **Share Room ID**: Invite others by sharing the room ID
3. **Start Editing**: Code changes sync instantly for all users
4. **Switch Language**: All users see synchronized language changes

## 📁 Project Structure

```
src/
├── components/        # Editor, Client list components
├── pages/            # Home, EditorPage components
├── Actions.js        # Socket event constants
├── socket.js         # Socket.IO initialization
└── App.js            # Main routing
server.js            # Express + Socket.IO server
```

## 🐳 Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build

# Frontend: http://localhost:9000
# Backend: http://localhost:9000 (same server)
```

## 📝 Available Scripts

- `npm run start:front` - Start React dev server
- `npm run server:dev` - Start Node.js dev server with auto-reload
- `npm run build` - Build React for production
- `npm start` - Build and run production server

## 💡 How It Works

1. Users connect via Socket.IO WebSocket
2. Each user joins a room with a unique ID
3. Code editor state syncs across all clients
4. User actions (typing, language changes) broadcast to room members
5. Real-time conflict-free synchronization

## 🤝 Contributing

Feel free to fork, submit issues, and create pull requests.

## 📄 License

Open source - feel free to use and modify.
