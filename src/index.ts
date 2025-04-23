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
        .waiting-room {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
          margin-bottom: 20px;
          padding: 20px;
          text-align: center;
        }
        .waiting-info {
          margin: 15px 0;
          font-size: 16px;
        }
        .waiting-position {
          font-weight: bold;
          font-size: 24px;
          color: #3182ce;
          margin: 10px 0;
        }
        .tabs {
          display: flex;
          margin-bottom: 20px;
        }
        .tab {
          flex: 1;
          padding: 10px;
          text-align: center;
          background-color: #e2e8f0;
          cursor: pointer;
        }
        .tab.active {
          background-color: #4299e1;
          color: white;
        }
        .tab-content {
          display: none;
        }
        .tab-content.active {
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>HONC Chat App</h1>
        
        <div class="tabs">
          <div class="tab active" data-tab="waitingRoom">Find a Chat Partner</div>
          <div class="tab" data-tab="joinRoom">Join Specific Room</div>
        </div>
        
        <div id="waitingRoomTab" class="tab-content active">
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
        
        <div id="joinRoomTab" class="tab-content">
          <div id="roomSelector" class="room-selector">
            <h2>Join a Specific Chat Room</h2>
            <input type="text" id="roomInput" class="room-input" placeholder="Enter room name">
            <button id="joinButton" class="join-button">Join Room</button>
          </div>
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
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        const waitingRoomTab = document.getElementById('waitingRoomTab');
        const joinRoomTab = document.getElementById('joinRoomTab');
        const roomSelector = document.getElementById('roomSelector');
        const chatApp = document.getElementById('chatApp');
        const roomInput = document.getElementById('roomInput');
        const joinButton = document.getElementById('joinButton');
        const roomName = document.getElementById('roomName');
        const connectionStatus = document.getElementById('connectionStatus');
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
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
        
        // Tab switching
        tabs.forEach(tab => {
          tab.addEventListener('click', () => {
            // Remove active class from all tabs and contents
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab') + 'Tab';
            document.getElementById(tabId).classList.add('active');
          });
        });
        
        // Event Listeners
        joinButton.addEventListener('click', joinRoom);
        joinWaitingRoomButton.addEventListener('click', joinWaitingRoom);
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendMessage();
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
        
        // Join a specific room (used both for manual joining and pairing)
        function joinSpecificRoom(roomId, partnerName) {
          currentRoom = roomId;
          roomName.textContent = partnerName ? 'Chat with: ' + partnerName : 'Room: ' + roomId;
          
          // Hide tabs and show chat
          waitingRoomTab.style.display = 'none';
          joinRoomTab.style.display = 'none';
          chatApp.style.display = 'block';
          
          // Connect to WebSocket for the chat room
          connectWebSocket(roomId);
        }
        
        // Manual room joining
        function joinRoom() {
          const room = roomInput.value.trim();
          if (!room) return;
          
          joinSpecificRoom(room);
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
            messageInput.disabled = false;
            sendButton.disabled = false;
          };
          
          chatSocket.onclose = () => {
            console.log('Disconnected from chat WebSocket');
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
        
        // Send a message
        function sendMessage() {
          const message = messageInput.value.trim();
          if (!message || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) return;
          
          const msgData = {
            type: 'message',
            userId: userId,
            userName: userName,
            message: message
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
