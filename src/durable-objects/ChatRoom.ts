interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

export class ChatRoom {
  state: DurableObjectState;
  env: any;
  sessions: WebSocket[];
  messages: ChatMessage[];

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    this.messages = [];

    // Load previous messages from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedMessages = await this.state.storage.get<ChatMessage[]>(
        "messages"
      );
      this.messages = storedMessages || [];
    });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/websocket":
        if (request.headers.get("Upgrade") !== "websocket") {
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const { 0: client, 1: server } = new WebSocketPair();
        await this.handleSession(server);

        return new Response(null, {
          status: 101,
          webSocket: client,
        });

      case "/messages":
        return new Response(JSON.stringify({ messages: this.messages }), {
          headers: { "Content-Type": "application/json" },
        });

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async handleSession(webSocket: WebSocket) {
    // Accept the WebSocket connection
    webSocket.accept();

    // Add this WebSocket to the list of sessions
    this.sessions.push(webSocket);

    // Send the last 100 messages to the new client
    const recentMessages = this.messages.slice(-100);
    webSocket.send(
      JSON.stringify({ type: "history", messages: recentMessages })
    );

    // Set up event handlers for the WebSocket
    webSocket.addEventListener("message", async (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "message") {
          const message: ChatMessage = {
            userId: data.userId,
            userName: data.userName,
            message: data.message,
            timestamp: Date.now(),
          };

          // Add the message to the history
          this.messages.push(message);
          // Trim message history if it gets too long
          if (this.messages.length > 1000) {
            this.messages = this.messages.slice(-1000);
          }

          // Save messages to durable storage
          await this.state.storage.put("messages", this.messages);

          // Broadcast the message to all connected clients
          const messageData = JSON.stringify({ type: "message", message });
          this.broadcast(messageData);
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    webSocket.addEventListener("close", () => {
      // Remove this WebSocket from the list of sessions
      const index = this.sessions.indexOf(webSocket);
      if (index !== -1) this.sessions.splice(index, 1);
    });

    webSocket.addEventListener("error", () => {
      // Remove this WebSocket from the list of sessions
      const index = this.sessions.indexOf(webSocket);
      if (index !== -1) this.sessions.splice(index, 1);
    });
  }

  broadcast(message: string) {
    // Broadcast a message to all connected clients
    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch (error) {
        console.error("Error sending message to WebSocket:", error);
      }
    }
  }
}
