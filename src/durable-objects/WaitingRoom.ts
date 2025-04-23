interface WaitingUser {
  userId: string;
  userName: string;
  joinedAt: number;
  sessionId: string;
}

export class WaitingRoom {
  state: DurableObjectState;
  env: any;
  waitingSessions: Map<string, WebSocket>;
  waitingUsers: WaitingUser[];
  pairingInterval: number | null;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.waitingSessions = new Map();
    this.waitingUsers = [];
    this.pairingInterval = null;

    // Start the pairing process
    this.startPairingProcess();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/websocket":
        // Log the incoming request headers to debug WebSocket upgrade issues
        console.log(
          "WaitingRoom WebSocket request headers:",
          Object.fromEntries([...request.headers.entries()])
        );

        if (request.headers.get("Upgrade") !== "websocket") {
          console.error(
            "WebSocket upgrade not found. Headers:",
            Object.fromEntries([...request.headers.entries()])
          );
          return new Response("Expected Upgrade: websocket", { status: 426 });
        }

        const { 0: client, 1: server } = new WebSocketPair();

        // Generate a session ID for this connection
        const sessionId = crypto.randomUUID();
        await this.handleWaitingSession(server, sessionId);

        return new Response(null, {
          status: 101,
          webSocket: client,
        });

      case "/status":
        return new Response(
          JSON.stringify({
            waitingCount: this.waitingUsers.length,
          }),
          { headers: { "Content-Type": "application/json" } }
        );

      default:
        return new Response("Not found", { status: 404 });
    }
  }

  async handleWaitingSession(webSocket: WebSocket, sessionId: string) {
    // Accept the WebSocket connection
    webSocket.accept();

    // Add this WebSocket to the map of waiting sessions
    this.waitingSessions.set(sessionId, webSocket);

    // Send initial waiting status
    webSocket.send(
      JSON.stringify({
        type: "waiting",
        position: this.waitingUsers.length + 1,
        message:
          "You've joined the waiting room. Please wait to be paired with someone.",
      })
    );

    // Set up event handlers for the WebSocket
    webSocket.addEventListener("message", async (event) => {
      try {
        const data = JSON.parse(event.data as string);

        if (data.type === "join") {
          // Add user to waiting list
          const user: WaitingUser = {
            userId: data.userId,
            userName: data.userName,
            joinedAt: Date.now(),
            sessionId,
          };

          this.waitingUsers.push(user);

          // Update all waiting clients with new positions
          this.broadcastWaitingPositions();
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    webSocket.addEventListener("close", () => {
      // Remove this session and any associated user
      this.waitingSessions.delete(sessionId);
      const userIndex = this.waitingUsers.findIndex(
        (u) => u.sessionId === sessionId
      );
      if (userIndex !== -1) {
        this.waitingUsers.splice(userIndex, 1);
        // Update positions for remaining users
        this.broadcastWaitingPositions();
      }
    });

    webSocket.addEventListener("error", () => {
      // Handle the same as close
      this.waitingSessions.delete(sessionId);
      const userIndex = this.waitingUsers.findIndex(
        (u) => u.sessionId === sessionId
      );
      if (userIndex !== -1) {
        this.waitingUsers.splice(userIndex, 1);
        this.broadcastWaitingPositions();
      }
    });
  }

  broadcastWaitingPositions() {
    // Send updated positions to all waiting users
    this.waitingUsers.forEach((user, index) => {
      const socket = this.waitingSessions.get(user.sessionId);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "waiting",
            position: index + 1,
            message: `You are #${index + 1} in line. Please wait to be paired.`,
          })
        );
      }
    });
  }

  startPairingProcess() {
    // Check for pairs every 5 seconds
    this.pairingInterval = setInterval(() => {
      this.pairWaitingUsers();
    }, 5000) as unknown as number;
  }

  async pairWaitingUsers() {
    // Need at least 2 users to make a pair
    if (this.waitingUsers.length < 2) return;

    // Take the two users who have been waiting the longest
    const [user1, user2] = this.waitingUsers.splice(0, 2);

    // Create a unique room ID for this pair
    const roomId = `pair_${crypto.randomUUID()}`;

    // Get the chat room DO for this new pair
    const roomId_obj = this.env.CHAT_ROOM.idFromName(roomId);
    const chatRoom = this.env.CHAT_ROOM.get(roomId_obj);

    // Store the pairing in KV for record keeping
    await this.env.WAITING_ROOM_KV.put(
      `pair:${roomId}`,
      JSON.stringify({
        user1: { id: user1.userId, name: user1.userName },
        user2: { id: user2.userId, name: user2.userName },
        pairedAt: Date.now(),
      }),
      { expirationTtl: 86400 } // Expire after 1 day
    );

    // Notify both users they've been paired
    const socket1 = this.waitingSessions.get(user1.sessionId);
    const socket2 = this.waitingSessions.get(user2.sessionId);

    if (socket1 && socket1.readyState === WebSocket.OPEN) {
      socket1.send(
        JSON.stringify({
          type: "paired",
          roomId,
          partnerId: user2.userId,
          partnerName: user2.userName,
          message: `You've been paired with ${user2.userName}. Joining chat room...`,
        })
      );
    }

    if (socket2 && socket2.readyState === WebSocket.OPEN) {
      socket2.send(
        JSON.stringify({
          type: "paired",
          roomId,
          partnerId: user1.userId,
          partnerName: user1.userName,
          message: `You've been paired with ${user1.userName}. Joining chat room...`,
        })
      );
    }

    // Update waiting positions for remaining users
    this.broadcastWaitingPositions();
  }
}
