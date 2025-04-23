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
      <title>Emoji Movie Guesser</title>
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
          margin-bottom: 5px;
        }
        .subtitle {
          text-align: center;
          color: #666;
          margin-top: 0;
          margin-bottom: 30px;
        }
        .game-app {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .game-header {
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
          max-width: 80%;
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
        .system-message {
          background-color: #fed7d7;
          color: #742a2a;
          align-self: center;
          font-weight: bold;
          max-width: 90%;
          text-align: center;
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
          font-size: 20px; /* Larger for emojis */
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
        .user-form {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          padding: 20px;
          margin-bottom: 20px;
        }
        .form-group {
          margin-bottom: 15px;
        }
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        .form-group input {
          width: 100%;
          padding: 10px;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          box-sizing: border-box;
        }
        .join-button {
          background-color: #48bb78;
          color: white;
          border: none;
          border-radius: 5px;
          padding: 10px 15px;
          cursor: pointer;
          width: 100%;
          font-size: 16px;
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
        .game-info {
          background-color: #ebf8ff;
          border: 1px solid #bee3f8;
          border-radius: 5px;
          padding: 15px;
          margin: 15px 0;
        }
        .game-info h3 {
          margin-top: 0;
          color: #2b6cb0;
        }
        .emoji-only {
          font-size: 24px;
          line-height: 1.5;
        }
        .waiting {
          text-align: center;
          padding: 20px;
          color: #718096;
          font-style: italic;
        }
        .winner {
          background-color: #fefcbf;
          border: 1px solid #f6e05e;
          border-radius: 5px;
          padding: 15px;
          margin: 15px 0;
          text-align: center;
        }
        .winner h3 {
          margin-top: 0;
          color: #744210;
        }
        .user-list {
          padding: 10px 15px;
          background-color: #e2e8f0;
          border-radius: 5px;
          margin-bottom: 15px;
        }
        .user-count {
          font-weight: bold;
        }
        .emoji-keyboard {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 10px;
        }
        .emoji-btn {
          font-size: 20px;
          padding: 5px 10px;
          background: none;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
          cursor: pointer;
        }
        .emoji-btn:hover {
          background-color: #f7fafc;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎬 Emoji Movie Guesser 🎮</h1>
        <p class="subtitle">Describe movies using only emojis and compete for the highest score!</p>
        
        <div id="userForm" class="user-form">
          <h2>Join the Game</h2>
          <div class="form-group">
            <label for="userNameInput">Your Name:</label>
            <input type="text" id="userNameInput" placeholder="Enter your name">
          </div>
          <button id="joinButton" class="join-button">Join Game</button>
        </div>
        
        <div id="gameApp" class="game-app" style="display: none;">
          <div class="game-header">
            <div id="roomName">Emoji Movie Room</div>
            <div id="connectionStatus" class="status disconnected">Disconnected</div>
          </div>
          
          <div id="gameInfo" class="game-info" style="display: none;">
            <h3>Current Movie:</h3>
            <p id="moviePrompt"></p>
            <p><strong>Describe this movie using ONLY emojis!</strong></p>
          </div>
          
          <div id="userList" class="user-list">
            <span class="user-count">0</span> players connected
          </div>
          
          <div id="winnerBox" class="winner" style="display: none;">
            <h3>Round Winner</h3>
            <div id="winnerInfo"></div>
          </div>
          
          <div id="chatMessages" class="chat-messages">
            <!-- Messages will be added here -->
            <div class="system-message">Welcome to Emoji Movie Guesser! Wait for another player to join.</div>
          </div>
          
          <div class="emoji-keyboard" id="emojiKeyboard">
            <button class="emoji-btn">🎬</button>
            <button class="emoji-btn">🎭</button>
            <button class="emoji-btn">🎞️</button>
            <button class="emoji-btn">🎥</button>
            <button class="emoji-btn">👨</button>
            <button class="emoji-btn">👩</button>
            <button class="emoji-btn">👧</button>
            <button class="emoji-btn">👦</button>
            <button class="emoji-btn">👶</button>
            <button class="emoji-btn">👴</button>
            <button class="emoji-btn">👵</button>
            <button class="emoji-btn">🧙</button>
            <button class="emoji-btn">🦸</button>
            <button class="emoji-btn">🦹</button>
            <button class="emoji-btn">👮</button>
            <button class="emoji-btn">🕵️</button>
            <button class="emoji-btn">👑</button>
            <button class="emoji-btn">❤️</button>
            <button class="emoji-btn">💔</button>
            <button class="emoji-btn">💣</button>
            <button class="emoji-btn">🔫</button>
            <button class="emoji-btn">🚢</button>
            <button class="emoji-btn">✈️</button>
            <button class="emoji-btn">🚀</button>
            <button class="emoji-btn">🏰</button>
            <button class="emoji-btn">🌍</button>
            <button class="emoji-btn">🌌</button>
            <button class="emoji-btn">⏰</button>
            <button class="emoji-btn">💰</button>
            <button class="emoji-btn">🐉</button>
            <button class="emoji-btn">🦖</button>
            <button class="emoji-btn">👽</button>
            <button class="emoji-btn">👻</button>
            <button class="emoji-btn">🤖</button>
            <button class="emoji-btn">💻</button>
            <button class="emoji-btn">📱</button>
            <button class="emoji-btn">🧠</button>
            <button class="emoji-btn">👁️</button>
            <button class="emoji-btn">💍</button>
            <button class="emoji-btn">⚔️</button>
            <button class="emoji-btn">🔮</button>
          </div>
          
          <div class="message-form">
            <input type="text" id="messageInput" class="message-input" placeholder="Type emojis here...">
            <button id="sendButton" class="send-button">Send</button>
          </div>
        </div>
      </div>

      <script>
        document.addEventListener('DOMContentLoaded', () => {
          // DOM elements
          const userForm = document.getElementById('userForm');
          const userNameInput = document.getElementById('userNameInput');
          const joinButton = document.getElementById('joinButton');
          const gameApp = document.getElementById('gameApp');
          const connectionStatus = document.getElementById('connectionStatus');
          const chatMessages = document.getElementById('chatMessages');
          const messageInput = document.getElementById('messageInput');
          const sendButton = document.getElementById('sendButton');
          const gameInfo = document.getElementById('gameInfo');
          const moviePrompt = document.getElementById('moviePrompt');
          const userList = document.getElementById('userList');
          const userCount = userList.querySelector('.user-count');
          const winnerBox = document.getElementById('winnerBox');
          const winnerInfo = document.getElementById('winnerInfo');
          const emojiKeyboard = document.getElementById('emojiKeyboard');
          
          // State
          let socket = null;
          let userName = '';
          let userId = '';
          let gameState = null;
          let hasSubmitted = false;
          
          // Event Listeners
          joinButton.addEventListener('click', joinGame);
          sendButton.addEventListener('click', sendMessage);
          messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
          });
          
          // Set up emoji keyboard
          emojiKeyboard.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              messageInput.value += btn.textContent;
              messageInput.focus();
            });
          });
          
          // Join the game
          function joinGame() {
            userName = userNameInput.value.trim();
            if (!userName) {
              alert('Please enter your name');
              return;
            }
            
            // Generate a random user ID
            userId = 'user_' + Math.floor(Math.random() * 100000);
            
            // Hide the user form and show the game
            userForm.style.display = 'none';
            gameApp.style.display = 'block';
            
            // Connect to WebSocket
            connectWebSocket();
          }
          
          // Connect to WebSocket
          function connectWebSocket() {
            // Close existing connections
            if (socket) {
              socket.close();
            }
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/api/chat/room/emoji-movie-room/websocket';
            
            socket = new WebSocket(wsUrl);
            
            socket.onopen = () => {
              console.log('Connected to WebSocket');
              connectionStatus.textContent = 'Connected';
              connectionStatus.className = 'status connected';
              messageInput.disabled = false;
              sendButton.disabled = false;
              
              // Send a join message
              const joinMessage = {
                type: 'message',
                userId: userId,
                userName: userName,
                message: '\u{1F44B} ' + userName + ' has joined the game!'
              };
              socket.send(JSON.stringify(joinMessage));
            };
            
            socket.onclose = () => {
              console.log('Disconnected from WebSocket');
              connectionStatus.textContent = 'Disconnected';
              connectionStatus.className = 'status disconnected';
              messageInput.disabled = true;
              sendButton.disabled = true;
              
              // Try to reconnect after delay
              setTimeout(() => {
                connectWebSocket();
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
                  
                  // Update game state if provided
                  if (data.gameState) {
                    updateGameState(data.gameState);
                  }
                } else if (data.type === 'message') {
                  addMessageToChat(data.message);
                } else if (data.type === 'game-state') {
                  updateGameState(data.gameState);
                }
              } catch (error) {
                console.error('Error handling message:', error);
              }
            };
            
            socket.onerror = (error) => {
              console.error('WebSocket error:', error);
            };
          }
          
          // Check if message contains only emojis - using a very simple approach
          function hasOnlyEmojis(text) {
            // Basic check - emojis and other symbols are typically above ASCII range
            if (text.length === 0) return false;
            
            for (let i = 0; i < text.length; i++) {
              if (text.charCodeAt(i) <= 127) {
                return false;
              }
            }
            return true;
          }
          
          // Send a message
          function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || !socket || socket.readyState !== WebSocket.OPEN) return;
            
            const isEmojiOnly = hasOnlyEmojis(message);
            
            // If game is active and this is an emoji-only message, mark as submission
            if (gameState && gameState.isActive && !gameState.roundEnded && isEmojiOnly && !hasSubmitted) {
              hasSubmitted = true;
              
              // Submit emoji for scoring
              fetch('/api/chat/room/emoji-movie-room/game/submit-emoji', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  userId: userId,
                  userName: userName,
                  emoji: message
                })
              });
              
              addStatusMessage('Your emoji description has been submitted for scoring!');
            }
            
            // Send message through WebSocket
            const msgData = {
              type: 'message',
              userId: userId,
              userName: userName,
              message: message
            };
            
            socket.send(JSON.stringify(msgData));
            
            // Clear input
            messageInput.value = '';
          }
          
          // Add a message to the chat display
          function addMessageToChat(msg) {
            const messageDiv = document.createElement('div');
            
            if (msg.isSystemMessage) {
              messageDiv.className = 'message system-message';
              messageDiv.innerHTML = msg.message.replace(/\\n/g, '<br>');
            } else if (msg.userId === userId) {
              messageDiv.className = 'message user-message';
              
              const header = document.createElement('div');
              header.style.fontSize = '12px';
              header.style.marginBottom = '5px';
              header.textContent = 'You';
              
              const content = document.createElement('div');
              // If message contains only emojis, make them larger
              if (hasOnlyEmojis(msg.message)) {
                content.className = 'emoji-only';
              }
              content.textContent = msg.message;
              
              messageDiv.appendChild(header);
              messageDiv.appendChild(content);
            } else {
              messageDiv.className = 'message other-message';
              
              const header = document.createElement('div');
              header.style.fontSize = '12px';
              header.style.marginBottom = '5px';
              header.textContent = msg.userName;
              
              const content = document.createElement('div');
              // If message contains only emojis, make them larger
              if (hasOnlyEmojis(msg.message)) {
                content.className = 'emoji-only';
              }
              content.textContent = msg.message;
              
              messageDiv.appendChild(header);
              messageDiv.appendChild(content);
            }
            
            chatMessages.appendChild(messageDiv);
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          
          // Add a status message (local only)
          function addStatusMessage(message) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message system-message';
            messageDiv.textContent = message;
            chatMessages.appendChild(messageDiv);
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          
          // Update the game state
          function updateGameState(newState) {
            gameState = newState;
            
            // Update player count based on active submissions
            const playerCount = gameState.isActive ? Object.keys(gameState.submissions).length : 0;
            userCount.textContent = playerCount;
            
            if (gameState.isActive) {
              // Show game info with movie prompt
              gameInfo.style.display = 'block';
              moviePrompt.textContent = gameState.moviePrompt;
              
              // Reset submission state at the start of a new round
              if (!gameState.roundEnded) {
                hasSubmitted = false;
                winnerBox.style.display = 'none';
              }
              
              // If round ended and we have a winner, show it
              if (gameState.roundEnded && gameState.winner) {
                winnerBox.style.display = 'block';
                
                // Construct winner info HTML
                let winnerHTML = '<p><strong>' + gameState.winner.userName + '</strong> won with ' + gameState.winner.score + ' points!</p>';
                winnerHTML += '<p>Submissions:</p><ul>';
                
                for (const userId in gameState.submissions) {
                  const sub = gameState.submissions[userId];
                  winnerHTML += '<li><strong>' + sub.userName + '</strong>: ' + sub.emoji + ' (Score: ' + (sub.score || 0) + ')</li>';
                }
                
                winnerHTML += '</ul>';
                
                winnerInfo.innerHTML = winnerHTML;
              }
            } else {
              // Hide game info when no active game
              gameInfo.style.display = 'none';
              winnerBox.style.display = 'none';
            }
          }
          
          // Initialize with a random username
          userNameInput.value = 'Player' + Math.floor(Math.random() * 1000);
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

  return chatRoom.fetch(new Request(newUrl, c.req));
});

// Start a game in a chat room
app.post("/api/chat/room/:roomId/game/start", async (c) => {
  const roomId = c.req.param("roomId");

  // Convert the room ID to a Durable Object ID
  const id = c.env.CHAT_ROOM.idFromName(roomId);

  // Get the Durable Object stub
  const chatRoom = c.env.CHAT_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/game/start";

  return chatRoom.fetch(
    new Request(newUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
  );
});

// Submit an emoji to the game
app.post("/api/chat/room/:roomId/game/submit-emoji", async (c) => {
  const roomId = c.req.param("roomId");
  const data = await c.req.json();

  // Convert the room ID to a Durable Object ID
  const id = c.env.CHAT_ROOM.idFromName(roomId);

  // Get the Durable Object stub
  const chatRoom = c.env.CHAT_ROOM.get(id);

  // Forward the request to the Durable Object
  const newUrl = new URL(c.req.url);
  newUrl.pathname = "/game/submit-emoji";

  return chatRoom.fetch(
    new Request(newUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  );
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
