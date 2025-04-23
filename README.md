# HONC Chat App

A real-time chat application built with the HONC stack (Hono, OAuth, Next.js, Cloudflare) using Cloudflare Durable Objects for state management.

## Features

- Real-time chat using WebSockets
- Multiple chat rooms
- Persistent message storage
- User authentication

## Project Structure

- `src/durable-objects/ChatRoom.ts` - Durable Object implementation for chat rooms
- `src/db/schema.ts` - Database schema including tables for users and messages
- `src/components/` - React components for the chat UI
- `src/static/` - Static assets for the frontend

## Technology Stack

- **Hono**: For API routes and handling HTTP requests
- **Cloudflare Workers**: For serverless execution
- **Cloudflare Durable Objects**: For stateful WebSocket connections and real-time chat
- **NeonDB**: For persistent data storage
- **React**: For the frontend user interface

## Getting Started

### Prerequisites

- Node.js (v18+)
- Cloudflare account (for Durable Objects)
- Wrangler CLI

### Installation

1. Clone the repository
2. Install dependencies

```bash
npm install
```

3. Set up your database

```bash
npm run db:setup
```

4. Add your environment variables to `.dev.vars`

```
DATABASE_URL=your_neon_db_url
```

### Development

Start the development server:

```bash
npm run dev
```

### Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## How it works

The application uses Cloudflare Durable Objects to maintain WebSocket connections and chat state. Each chat room is represented by a Durable Object instance, which maintains its own state including the list of connected users and message history.

When a user sends a message, it's broadcast to all connected clients in real-time, and also persisted to the database for historical purposes.

## License

MIT
