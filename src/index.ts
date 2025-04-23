import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { html } from "hono/html";
import { users, messages } from "./db/schema";
import { ChatRoom } from "./durable-objects/ChatRoom";

type Bindings = {
  DATABASE_URL: string;
  CHAT_ROOM: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// Setup CORS
app.use("*", cors());

// Serve the main app page
app.get("/", (c) => {
  return c.html(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>HONC Chat App</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        h1 {
          color: #333;
          text-align: center;
        }
        .chat-app {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .chat-header {
          background-color: #4a5568;
          color: white;
          padding: 15px;
          font-size: 18px;
          display: flex;
          justify-content: space-between;
        }
        .chat-messages {
          height: 400px;
          overflow-y: auto;
          padding: 15px;
          display: flex;
          flex-direction: column;
        }
        .message {
          margin-bottom: 10px;
          padding: 10px 15px;
          border-radius: 5px;
          max-width: 70%;
        }
        .user-message {
          background-color: #bee3f8;
          color: #2c5282;
          align-self: flex-end;
        }
        .other-message {
          background-color: #e2e8f0;
          color: #2d3748;
          align-self: flex-start;
        }
        .message-form {
          display: flex;
          padding: 15px;
          border-top: 1px solid #e2e8f0;
        }
        .message-input {
          flex: 1;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          margin-right: 10px;
        }
        .send-button {
          background-color: #4299e1;
          color: white;
          border: none;
          border-radius: 5px;
          padding: 10px 15px;
          cursor: pointer;
        }
        .send-button:hover {
          background-color: #3182ce;
        }
        .room-selector {
          margin-bottom: 20px;
        }
        .room-input {
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          margin-right: 10px;
          width: 70%;
        }
        .join-button {
          background-color: #48bb78;
          color: white;
          border: none;
          border-radius: 5px;
          padding: 10px 15px;
          cursor: pointer;
        }
        .status {
          font-size: 14px;
          padding: 5px 10px;
          border-radius: 999px;
        }
        .connected {
          background-color: #c6f6d5;
          color: #276749;
        }
        .disconnected {
          background-color: #fed7d7;
          color: #c53030;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>HONC Chat App</h1>
        
        <div id="roomSelector" class="room-selector">
          <h2>Join a Chat Room</h2>
          <input type="text" id="roomInput" class="room-input" placeholder="Enter room name">
          <button id="joinButton" class="join-button">Join Room</button>
        </div>
        
        <div id="chatApp" class="chat-app" style="display: none;">
          <div class="chat-header">
            <div id="roomName">Room: General</div>
            <div id="connectionStatus" class="status disconnected">Disconnected</div>
          </div>
          
          <div id="chatMessages" class="chat-messages">
            <!-- Messages will be added here -->
          </div>
          
          <div class="message-form">
            <input type="text" id="messageInput" class="message-input" placeholder="Type a message...">
            <button id="sendButton" class="send-button">Send</button>
          </div>
        </div>
      </div>

      <script>
        // DOM elements
        const roomSelector = document.getElementById('roomSelector');
        const chatApp = document.getElementById('chatApp');
        const roomInput = document.getElementById('roomInput');
        const joinButton = document.getElementById('joinButton');
        const roomName = document.getElementById('roomName');
        const connectionStatus = document.getElementById('connectionStatus');
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        // State
        let currentRoom = null;
        let socket = null;
        let userName = 'User-' + Math.floor(Math.random() * 1000);
        let userId = Math.floor(Math.random() * 10000).toString();
        
        // Event Listeners
        joinButton.addEventListener('click', joinRoom);
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendMessage();
        });
        
        // Join a room
        function joinRoom() {
          const room = roomInput.value.trim();
          if (!room) return;
          
          currentRoom = room;
          roomName.textContent = 'Room: ' + room;
          
          // Hide room selector and show chat
          roomSelector.style.display = 'none';
          chatApp.style.display = 'block';
          
          // Connect to WebSocket
          connectWebSocket(room);
        }
        
        // Connect to WebSocket for a specific room
        function connectWebSocket(room) {
          // Close existing connections
          if (socket) {
            socket.close();
          }
          
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host + '/api/chat/room/' + room + '/websocket';
          
          socket = new WebSocket(wsUrl);
          
          socket.onopen = () => {
            console.log('Connected to WebSocket');
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'status connected';
            messageInput.disabled = false;
            sendButton.disabled = false;
          };
          
          socket.onclose = () => {
            console.log('Disconnected from WebSocket');
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'status disconnected';
            messageInput.disabled = true;
            sendButton.disabled = true;
            
            // Try to reconnect after delay
            setTimeout(() => {
              if (currentRoom) {
                connectWebSocket(currentRoom);
              }
            }, 5000);
          };
          
          socket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'history') {
                // Clear existing messages
                chatMessages.innerHTML = '';
                
                // Add historical messages
                data.messages.forEach(msg => {
                  addMessageToChat(msg);
                });
              } else if (data.type === 'message') {
                addMessageToChat(data.message);
              }
            } catch (error) {
              console.error('Error handling message:', error);
            }
          };
          
          socket.onerror = (error) => {
            console.error('WebSocket error:', error);
          };
        }
        
        // Send a message
        function sendMessage() {
          const message = messageInput.value.trim();
          if (!message || !socket || socket.readyState !== WebSocket.OPEN) return;
          
          const msgData = {
            type: 'message',
            userId: userId,
            userName: userName,
            message: message
          };
          
          socket.send(JSON.stringify(msgData));
          
          // Also persist to DB
          fetch('/api/chat/room/' + currentRoom + '/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId,
              userName: userName,
              content: message
            })
          });
          
          // Clear input
          messageInput.value = '';
        }
        
        // Add a message to the chat display
        function addMessageToChat(msg) {
          const messageDiv = document.createElement('div');
          messageDiv.className = 'message ' + (msg.userId === userId ? 'user-message' : 'other-message');
          
          const header = document.createElement('div');
          header.style.fontSize = '12px';
          header.style.marginBottom = '5px';
          
          const time = new Date(msg.timestamp).toLocaleTimeString();
          header.textContent = msg.userName + ' • ' + time;
          
          const content = document.createElement('div');
          content.textContent = msg.message;
          
          messageDiv.appendChild(header);
          messageDiv.appendChild(content);
          chatMessages.appendChild(messageDiv);
          
          // Scroll to bottom
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      </script>
    </body>
    </html>`
  );
});

// API endpoint
app.get("/api", (c) => {
  return c.text("Honc! 🪿");
});

app.get("/api/users", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  return c.json({
    users: await db.select().from(users),
  });
});

// Chat API routes
app.get("/api/chat/rooms", async (c) => {
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  // Get unique room IDs from messages
  const allMessages = await db.select().from(messages);
  const uniqueRooms = [...new Set(allMessages.map((msg) => msg.roomId))];

  return c.json({ rooms: uniqueRooms });
});

// Create or get access to a chat room Durable Object
app.get("/api/chat/room/:roomId/websocket", async (c) => {
  const roomId = c.req.param("roomId");

  // Convert the room ID to a Durable Object ID
  const id = c.env.CHAT_ROOM.idFromName(roomId);

  // Get the Durable Object stub
  const chatRoom = c.env.CHAT_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/websocket";

  return chatRoom.fetch(new Request(newUrl, c.req));
});

// Get chat history for a specific room
app.get("/api/chat/room/:roomId/messages", async (c) => {
  const roomId = c.req.param("roomId");

  // Get messages from database
  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  const roomMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.roomId, roomId))
    .orderBy(messages.createdAt);

  return c.json({ messages: roomMessages });
});

// Store a new message (for backup/persistence)
app.post("/api/chat/room/:roomId/message", async (c) => {
  const roomId = c.req.param("roomId");
  const { userId, userName, content } = await c.req.json();

  const sql = neon(c.env.DATABASE_URL);
  const db = drizzle(sql);

  await db.insert(messages).values({
    content,
    roomId,
    userId,
    userName,
  });

  return c.json({ success: true });
});

/**
 * Serve a simplified api specification for your API
 * As of writing, this is just the list of routes and their methods.
 */
app.get("/openapi.json", (c) => {
  return c.json(
    createOpenAPISpec(app, {
      info: {
        title: "Honc D1 App",
        version: "1.0.0",
      },
    })
  );
});

/**
 * Mount the Fiberplane api explorer to be able to make requests against your API.
 *
 * Visit the explorer at `/fp`
 */
app.use(
  "/fp/*",
  createFiberplane({
    app,
    openapi: { url: "/openapi.json" },
  })
);

export default app;

// Export the ChatRoom class as a named export for Durable Objects
export { ChatRoom };
