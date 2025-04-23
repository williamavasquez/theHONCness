import { createFiberplane, createOpenAPISpec } from "@fiberplane/hono";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { html } from "hono/html";
import { users, messages } from "./db/schema";
import { ChatRoom } from "./durable-objects/ChatRoom";
import { WaitingRoom } from "./durable-objects/WaitingRoom";

type Bindings = {
  DATABASE_URL: string;
  CHAT_ROOM: DurableObjectNamespace;
  WAITING_ROOM: DurableObjectNamespace;
  WAITING_ROOM_KV: KVNamespace;
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
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <title>HONC Chat App</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f5f5f5;
          touch-action: manipulation; /* Prevent double-tap to zoom */
          height: 100%;
          width: 100%;
          overflow: hidden;
        }
        .container {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
          position: relative;
        }
        .chat-app {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
          height: 100vh;
          max-height: 100vh;
          display: flex;
          flex-direction: column;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 100;
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
          flex: 1;
          overflow-y: auto;
          padding: 15px;
          padding-bottom: 70px; /* Add padding to avoid messages being hidden behind keyboard */
          display: flex;
          flex-direction: column;
          background-color: #f9fafc;
        }
        .message {
          margin-bottom: 10px;
          padding: 10px 15px;
          border-radius: 16px;
          max-width: 80%;
          word-break: break-word;
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
          flex-direction: column;
          padding: 10px;
          border-top: 1px solid #e2e8f0;
          background-color: white;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 101;
        }
        .emoji-keyboard {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          background-color: #f9fafc;
          padding: 10px;
          border-radius: 5px 5px 0 0;
          border: 1px solid #e2e8f0;
          border-bottom: none;
        }
        .emoji-btn {
          font-size: 28px;
          background: none;
          border: none;
          cursor: pointer;
          border-radius: 8px;
          padding: 8px;
          transition: background-color 0.2s;
          height: 50px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .emoji-btn:hover, .emoji-btn:active {
          background-color: #e2e8f0;
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
        .waiting-room {
          background-color: white;
          overflow: hidden;
          text-align: center;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 200;
        }
        .waiting-info {
          margin: 15px 0;
          font-size: 16px;
          width: 100%;
        }
        .waiting-position {
          font-weight: bold;
          font-size: 28px;
          color: #3182ce;
          margin: 15px 0;
        }
        
        /* Media queries for responsive design */
        @media (max-width: 480px) {
          .container {
            padding: 0;
          }
          .waiting-room {
            border-radius: 0;
            box-shadow: none;
            padding: 15px;
          }
          .chat-app {
            border-radius: 0;
            box-shadow: none;
          }
          .emoji-keyboard {
            grid-template-columns: repeat(5, 1fr);
            gap: 5px;
            padding: 8px;
          }
          .emoji-btn {
            font-size: 24px;
            padding: 5px;
            height: 44px;
          }
          .message {
            max-width: 85%;
            padding: 8px 12px;
          }
          .chat-messages {
            padding-bottom: 80px;
          }
        }
        
        /* Make sure full screen works well in iOS */
        @media screen and (orientation: portrait) {
          html, body {
            height: 100%;
            overflow: hidden;
            position: fixed;
            width: 100%;
          }
        }
        
        /* Handle notches and home indicators on iPhone X and newer */
        @supports (padding: max(0px)) {
          .message-form {
            padding-bottom: max(10px, env(safe-area-inset-bottom));
          }
          .chat-messages {
            padding-bottom: max(70px, calc(70px + env(safe-area-inset-bottom)));
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div id="waitingRoomTab" class="tab-content">
          <div class="waiting-room">
            <h2>Waiting Room</h2>
            <p>Looking for a chat partner... Please wait while we pair you with someone.</p>
            <div id="waitingStatus" class="waiting-info">
              <p>You are in the waiting room.</p>
              <div class="waiting-position">Position: <span id="positionNumber">1</span></div>
              <p id="waitingMessage">Please wait to be paired with someone...</p>
            </div>
            <button id="joinWaitingRoomButton" class="join-button" style="display: none;">Join Waiting Room</button>
          </div>
        </div>
        
        <div id="chatApp" class="chat-app" style="display: none;">
          <div class="chat-header">
            <div id="roomName">HONC Chat App</div>
            <div id="connectionStatus" class="status disconnected">Disconnected</div>
          </div>
          
          <div id="chatMessages" class="chat-messages">
            <!-- Messages will be added here -->
          </div>
          
          <div class="message-form">
            <div class="emoji-keyboard">
              <button class="emoji-btn" data-emoji="😊">😊</button>
              <button class="emoji-btn" data-emoji="😂">😂</button>
              <button class="emoji-btn" data-emoji="😍">😍</button>
              <button class="emoji-btn" data-emoji="🥰">🥰</button>
              <button class="emoji-btn" data-emoji="😎">😎</button>
              <button class="emoji-btn" data-emoji="👍">👍</button>
              <button class="emoji-btn" data-emoji="❤️">❤️</button>
              <button class="emoji-btn" data-emoji="🔥">🔥</button>
              <button class="emoji-btn" data-emoji="🙌">🙌</button>
              <button class="emoji-btn" data-emoji="👏">👏</button>
              <button class="emoji-btn" data-emoji="🎉">🎉</button>
              <button class="emoji-btn" data-emoji="🤔">🤔</button>
              <button class="emoji-btn" data-emoji="😭">😭</button>
              <button class="emoji-btn" data-emoji="🥺">🥺</button>
              <button class="emoji-btn" data-emoji="😢">😢</button>
              <button class="emoji-btn" data-emoji="😡">😡</button>
              <button class="emoji-btn" data-emoji="👋">👋</button>
              <button class="emoji-btn" data-emoji="✨">✨</button>
              <button class="emoji-btn" data-emoji="💯">💯</button>
              <button class="emoji-btn" data-emoji="🙏">🙏</button>
            </div>
          </div>
        </div>
      </div>

      <script>
        // DOM elements
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const waitingRoomTab = document.getElementById('waitingRoomTab');
        const chatApp = document.getElementById('chatApp');
        const roomName = document.getElementById('roomName');
        const connectionStatus = document.getElementById('connectionStatus');
        const chatMessages = document.getElementById('chatMessages');
        const joinWaitingRoomButton = document.getElementById('joinWaitingRoomButton');
        const waitingStatus = document.getElementById('waitingStatus');
        const positionNumber = document.getElementById('positionNumber');
        const waitingMessage = document.getElementById('waitingMessage');
        
        // State
        let currentRoom = null;
        let chatSocket = null;
        let waitingSocket = null;
        let userName = 'User-' + Math.floor(Math.random() * 1000);
        let userId = Math.floor(Math.random() * 10000).toString();
        
        // Event Listeners
        joinWaitingRoomButton.addEventListener('click', joinWaitingRoom);
        
        // Set up emoji keyboard
        document.querySelectorAll('.emoji-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const emoji = btn.getAttribute('data-emoji');
            if (emoji) {
              sendEmojiMessage(emoji);
            }
          });
        });
        
        // Join the waiting room
        function joinWaitingRoom() {
          // No longer need to show waitingStatus or disable the button as they're handled in HTML
          
          // Connect to WebSocket for waiting room
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host + '/api/waiting-room/websocket';
          
          // Close existing connection if any
          if (waitingSocket) {
            waitingSocket.close();
          }
          
          waitingSocket = new WebSocket(wsUrl);
          
          waitingSocket.onopen = () => {
            console.log('Connected to waiting room');
            // Send join message
            waitingSocket.send(JSON.stringify({
              type: 'join',
              userId,
              userName
            }));
          };
          
          waitingSocket.onclose = () => {
            console.log('Disconnected from waiting room');
            
            // Try to reconnect after delay if still in waiting room and not paired yet
            if (chatApp.style.display === 'none') {
              setTimeout(joinWaitingRoom, 5000);
            }
          };
          
          waitingSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
            waitingMessage.textContent = 'Error connecting to waiting room. Attempting to reconnect...';
            
            // Try to reconnect after error
            setTimeout(joinWaitingRoom, 3000);
          };
          
          waitingSocket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              if (data.type === 'waiting') {
                // Update position in queue
                positionNumber.textContent = data.position;
                if (data.message) {
                  waitingMessage.textContent = data.message;
                }
              } else if (data.type === 'paired') {
                // We've been paired with someone!
                // No need to hide/show elements that are already properly set up
                
                // Close waiting room connection
                if (waitingSocket) {
                  waitingSocket.close();
                  waitingSocket = null;
                }
                
                // Join the assigned chat room
                joinSpecificRoom(data.roomId, data.partnerName);
              }
            } catch (error) {
              console.error('Error handling waiting room message:', error);
            }
          };
        }
        
        // Join a specific room (used for pairing)
        function joinSpecificRoom(roomId, partnerName) {
          currentRoom = roomId;
          // Always keep the header as "HONC Chat App" regardless of partner
          roomName.textContent = "HONC Chat App";
          
          // Hide waiting room and show chat
          waitingRoomTab.style.display = 'none';
          chatApp.style.display = 'block';
          
          // Connect to WebSocket for the chat room
          connectWebSocket(roomId);
        }
        
        // Connect to WebSocket for a specific room
        function connectWebSocket(room) {
          // Close existing connections
          if (chatSocket) {
            chatSocket.close();
          }
          
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = protocol + '//' + window.location.host + '/api/chat/room/' + room + '/websocket';
          
          chatSocket = new WebSocket(wsUrl);
          
          chatSocket.onopen = () => {
            console.log('Connected to chat WebSocket');
            connectionStatus.textContent = 'Connected';
            connectionStatus.className = 'status connected';
          };
          
          chatSocket.onclose = () => {
            console.log('Disconnected from chat WebSocket');
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.className = 'status disconnected';
            
            // Try to reconnect after delay
            setTimeout(() => {
              if (currentRoom) {
                connectWebSocket(currentRoom);
              }
            }, 5000);
          };
          
          chatSocket.onmessage = (event) => {
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
          
          chatSocket.onerror = (error) => {
            console.error('WebSocket error:', error);
          };
        }
        
        // Send an emoji message
        function sendEmojiMessage(emoji) {
          if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
          
          const msgData = {
            type: 'message',
            userId: userId,
            userName: userName,
            message: emoji
          };
          
          chatSocket.send(JSON.stringify(msgData));
          
          // Also persist to DB
          fetch('/api/chat/room/' + currentRoom + '/message', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: userId,
              userName: userName,
              content: emoji
            })
          });
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
        
        // Automatically join waiting room on page load
        document.addEventListener('DOMContentLoaded', () => {
          // Auto-join waiting room when page loads
          joinWaitingRoom();
        });
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

  // Get the original request to preserve WebSocket upgrade headers
  const originalRequest = c.req.raw;

  return chatRoom.fetch(new Request(newUrl, originalRequest));
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

// Waiting Room API routes
app.get("/api/waiting-room/status", async (c) => {
  // Use the singleton WaitingRoom Durable Object
  const id = c.env.WAITING_ROOM.idFromName("default");
  const waitingRoom = c.env.WAITING_ROOM.get(id);

  // Forward the request to get status
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/status";

  return waitingRoom.fetch(new Request(newUrl, c.req));
});

app.get("/api/waiting-room/websocket", async (c) => {
  // Use the singleton WaitingRoom Durable Object
  const id = c.env.WAITING_ROOM.idFromName("default");
  const waitingRoom = c.env.WAITING_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/websocket";

  // Get the original request to preserve WebSocket upgrade headers
  const originalRequest = c.req.raw;

  // Create a new request with all the original headers to maintain the WebSocket upgrade
  return waitingRoom.fetch(new Request(newUrl, originalRequest));
});

// Get recent pairings from KV
app.get("/api/waiting-room/recent-pairs", async (c) => {
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam) : 10;

  // List all keys with the pair: prefix
  const keys = await c.env.WAITING_ROOM_KV.list({ prefix: "pair:" });

  // Get the most recent pairs
  const pairs: {
    roomId: string;
    user1: { id: string; name: string };
    user2: { id: string; name: string };
    pairedAt: number;
  }[] = [];

  for (const key of keys.keys.slice(0, limit)) {
    const pair = await c.env.WAITING_ROOM_KV.get(key.name, "json");
    if (pair) {
      pairs.push({
        roomId: key.name.replace("pair:", ""),
        ...(pair as {
          user1: { id: string; name: string };
          user2: { id: string; name: string };
          pairedAt: number;
        }),
      });
    }
  }

  // Sort by pairedAt descending
  pairs.sort((a, b) => b.pairedAt - a.pairedAt);

  return c.json({ pairs });
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
export { ChatRoom, WaitingRoom };
