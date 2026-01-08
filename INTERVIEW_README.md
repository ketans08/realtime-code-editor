# Realtime Code Editor - Interview Preparation Guide

## Project Overview

A **collaborative real-time code editor** where multiple users can edit code simultaneously in shared rooms. Think of it like Google Docs but for code.

## 🎯 Core Problem Solved

Managing concurrent code editing with instant synchronization across multiple clients without conflicts.

## 🏗️ Architecture Highlights

### Client-Server Model

- **Frontend** (React): UI with CodeMirror editor
- **Backend** (Node.js + Express): WebSocket server using Socket.IO
- **Communication**: Bidirectional WebSocket for real-time updates

### Key Components

| Component          | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| Socket.IO          | Real-time communication between client and server   |
| Room System        | Isolates user sessions - each room is independent   |
| User Tracking      | Maps usernames to socket IDs for presence awareness |
| Event Broadcasting | Syncs code changes to all room members instantly    |

## 💻 Technical Implementation

### Real-time Sync Flow

```
User types → Client emits event → Server receives →
Broadcasts to all room clients → UI updates for all users
```

### Room Management

- Users create/join rooms by ID
- Each room maintains list of connected socket IDs
- Broadcasting limited to room members (isolation)
- User leaves = room cleanup

### Data Structures (In-Memory)

```javascript
userSocketMap = { username: socketId }
rooms = { roomId: [socketId1, socketId2, ...] }
```

## 🔑 Key Design Decisions

1. **In-Memory Storage** - Fast synchronization, suitable for temporary sessions
2. **Socket.IO over WebSocket** - Automatic fallback to polling if WebSocket unavailable
3. **Room-based Isolation** - Prevents cross-talk between different sessions
4. **Client-Driven State** - Client maintains editor state, server broadcasts changes

## 📊 Scalability Considerations

| Aspect         | Current          | Challenge                                        |
| -------------- | ---------------- | ------------------------------------------------ |
| Storage        | In-memory        | Won't persist; needs DB for production           |
| Sessions       | Single server    | Horizontal scaling requires Redis/message queue  |
| Users per room | ~20-50 realistic | Broadcasting scales O(n) - consider diff syncing |
| Code size      | Limited          | Editor performance degrades with large files     |

## 🎓 Interview Talking Points

**Q: How do you prevent data conflicts?**

- Broadcasting ensures all clients see same state simultaneously
- No offline editing = no merge conflicts needed

**Q: What happens if someone has slow connection?**

- WebSocket auto-reconnect; Socket.IO queues events
- User may see stale code briefly but will sync when reconnected

**Q: How would you scale this?**

- Use Redis pub/sub for server-to-server communication
- Message queue for broadcast efficiency
- Database for persistence (MongoDB/PostgreSQL)
- Load balancer with sticky sessions or Redis session store

**Q: Why Socket.IO over raw WebSocket?**

- Fallback to long-polling/SSE if WebSocket unavailable
- Built-in reconnection logic
- Simpler API for room management

## 🔧 Technologies Used

| Layer     | Tech       | Why                                       |
| --------- | ---------- | ----------------------------------------- |
| Frontend  | React 17   | Component-based UI, easy state management |
| Editor    | CodeMirror | Feature-rich, multi-language support      |
| Real-time | Socket.IO  | WebSocket with fallbacks + rooms          |
| Backend   | Express    | Lightweight, popular, easy middleware     |
| Runtime   | Node.js    | JavaScript on server, non-blocking I/O    |

## 🚀 How to Demonstrate

1. **Show Real-time Sync**: Open two browser windows, type in one, see other update
2. **Explain Room Isolation**: Different rooms don't see each other's code
3. **Walk Through Code Flow**: Trace from user input → server → broadcast → UI update
4. **Discuss Trade-offs**: Why in-memory? Why not database? When would you change?

## ⚡ Performance Optimization Ideas

- **Debounce events** - Don't broadcast every keystroke, batch updates
- **Operational Transform** - Handle concurrent edits from multiple users
- **Code splitting** - Load only necessary components
- **Compression** - Compress large code blocks before sending

## 🎯 Why This Project Matters

- **Real-time Sync**: Core skill for modern web applications
- **Websocket/Socket.IO**: Understanding event-driven architecture
- **Room/Session Management**: Fundamental for multi-tenant systems
- **Scalability**: Shows awareness of production challenges
