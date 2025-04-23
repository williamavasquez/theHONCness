interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
  isSystemMessage?: boolean;
}

interface GameState {
  isActive: boolean;
  moviePrompt?: string;
  submissions: {
    [userId: string]: {
      userId: string;
      userName: string;
      emoji: string;
      score?: number;
    };
  };
  roundEnded: boolean;
  winner?: {
    userId: string;
    userName: string;
    score: number;
  };
  round: number;
}

export class ChatRoom {
  state: DurableObjectState;
  env: any;
  sessions: WebSocket[];
  messages: ChatMessage[];
  gameState: GameState;
  playerCount: number = 0;

  // Movie prompts - descriptions of movies for players to guess
  moviePrompts = [
    "A young wizard discovers he has magical powers and attends a school for wizards",
    "A group of friends journey to destroy a powerful ring",
    "A superhero in a metal suit fights villains with advanced technology",
    "A police officer is trapped in a building with terrorists during Christmas",
    "Two star-crossed lovers from feuding families fall in love and meet a tragic end",
    "A giant shark terrorizes a beach town",
    "A criminal mastermind places people in deadly traps to test their will to live",
    "A computer hacker discovers that reality is a simulation created by machines",
    "A group of dinosaurs are brought back to life in a theme park",
    "A man with a rare condition ages backwards",
    "An alien stranded on Earth befriends a young boy",
    "A nanny with magical powers helps a troubled family",
    "A team of thieves enter people's dreams to steal their secrets",
    "A man builds a baseball field on his farm to attract the ghosts of baseball legends",
    "A man lives the same day over and over again",
    "A archaeologist searches for religious artifacts while fighting Nazis",
    "Two toys compete for the affection of their owner",
    "A robot garbage collector finds love in a post-apocalyptic Earth",
    "A woman falls in love with an artificial intelligence operating system",
    "A team of superheroes tries to save the universe from a powerful villain",
  ];

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    this.messages = [];
    this.gameState = {
      isActive: false,
      submissions: {},
      roundEnded: false,
      round: 0,
    };

    // Load previous messages and game state from storage
    this.state.blockConcurrencyWhile(async () => {
      const storedMessages = await this.state.storage.get<ChatMessage[]>(
        "messages"
      );
      this.messages = storedMessages || [];

      const storedGameState = await this.state.storage.get<GameState>(
        "gameState"
      );
      if (storedGameState) {
        this.gameState = storedGameState;
      }
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

      case "/game/start":
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }
        await this.startNewGame();
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });

      case "/game/submit-emoji":
        if (request.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }

        const data = await request.json();
        await this.submitEmoji(data.userId, data.userName, data.emoji);

        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json" },
        });

      case "/game/state":
        return new Response(JSON.stringify({ gameState: this.gameState }), {
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
    this.playerCount++;

    // If we now have exactly 2 players, we can start the game
    if (this.playerCount === 2 && !this.gameState.isActive) {
      await this.startNewGame();
    }

    // Send the last 100 messages to the new client
    const recentMessages = this.messages.slice(-100);
    webSocket.send(
      JSON.stringify({
        type: "history",
        messages: recentMessages,
        gameState: this.gameState,
      })
    );

    // Send a system message that a new player has joined
    const joinMessage: ChatMessage = {
      userId: "system",
      userName: "System",
      message: `A new player has joined! (${this.playerCount} players connected)`,
      timestamp: Date.now(),
      isSystemMessage: true,
    };

    this.messages.push(joinMessage);
    await this.state.storage.put("messages", this.messages);
    this.broadcast(JSON.stringify({ type: "message", message: joinMessage }));

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

          // Check if this is an emoji submission during an active game
          if (
            this.gameState.isActive &&
            !this.gameState.roundEnded &&
            this.isEmojiOnly(data.message)
          ) {
            await this.submitEmoji(data.userId, data.userName, data.message);
          }
        } else if (data.type === "start-game") {
          await this.startNewGame();
        }
      } catch (error) {
        console.error("Error handling WebSocket message:", error);
      }
    });

    const closeHandler = () => {
      // Remove this WebSocket from the list of sessions
      const index = this.sessions.indexOf(webSocket);
      if (index !== -1) this.sessions.splice(index, 1);

      this.playerCount--;

      // Send system message that a player has left
      const leaveMessage: ChatMessage = {
        userId: "system",
        userName: "System",
        message: `A player has left. (${this.playerCount} players connected)`,
        timestamp: Date.now(),
        isSystemMessage: true,
      };

      this.messages.push(leaveMessage);
      this.state.storage.put("messages", this.messages);
      this.broadcast(
        JSON.stringify({ type: "message", message: leaveMessage })
      );

      // If game is active but we don't have enough players, end the game
      if (this.gameState.isActive && this.playerCount < 2) {
        this.endGame("Not enough players to continue the game.");
      }
    };

    webSocket.addEventListener("close", closeHandler);
    webSocket.addEventListener("error", closeHandler);
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

  // Start a new game
  async startNewGame() {
    if (this.playerCount < 2) {
      const systemMessage: ChatMessage = {
        userId: "system",
        userName: "System",
        message: "Need at least 2 players to start the game.",
        timestamp: Date.now(),
        isSystemMessage: true,
      };

      this.messages.push(systemMessage);
      await this.state.storage.put("messages", this.messages);
      this.broadcast(
        JSON.stringify({ type: "message", message: systemMessage })
      );
      return;
    }

    // Reset game state
    this.gameState = {
      isActive: true,
      moviePrompt: this.getRandomMoviePrompt(),
      submissions: {},
      roundEnded: false,
      round: this.gameState.round + 1,
    };

    await this.state.storage.put("gameState", this.gameState);

    // Announce new game
    const gameStartMessage: ChatMessage = {
      userId: "system",
      userName: "System",
      message: `📽️ NEW ROUND (${this.gameState.round}) STARTED! 📽️\n\nMovie to describe: "${this.gameState.moviePrompt}"\n\nDescribe this movie using ONLY EMOJIS! The system will score your submissions.`,
      timestamp: Date.now(),
      isSystemMessage: true,
    };

    this.messages.push(gameStartMessage);
    await this.state.storage.put("messages", this.messages);

    // Broadcast game state and start message
    this.broadcast(
      JSON.stringify({
        type: "game-state",
        gameState: this.gameState,
      })
    );

    this.broadcast(
      JSON.stringify({
        type: "message",
        message: gameStartMessage,
      })
    );
  }

  // Submit an emoji answer
  async submitEmoji(userId: string, userName: string, emoji: string) {
    if (!this.gameState.isActive || this.gameState.roundEnded) {
      return;
    }

    // Store submission
    this.gameState.submissions[userId] = {
      userId,
      userName,
      emoji,
    };

    await this.state.storage.put("gameState", this.gameState);

    // Announce submission
    const submissionMessage: ChatMessage = {
      userId: "system",
      userName: "System",
      message: `${userName} has submitted their emoji description!`,
      timestamp: Date.now(),
      isSystemMessage: true,
    };

    this.messages.push(submissionMessage);
    await this.state.storage.put("messages", this.messages);
    this.broadcast(
      JSON.stringify({ type: "message", message: submissionMessage })
    );

    // Check if all players have submitted
    const submissionCount = Object.keys(this.gameState.submissions).length;

    if (submissionCount >= 2) {
      // Evaluate submissions
      await this.evaluateSubmissions();
    }
  }

  // Evaluate emoji submissions
  async evaluateSubmissions() {
    if (!this.gameState.isActive || this.gameState.roundEnded) {
      return;
    }

    this.gameState.roundEnded = true;

    // Simple scoring algorithm - in a real app, you would use AI here
    // For now, we'll just assign random scores
    let highestScore = 0;
    let winner = null;

    for (const userId in this.gameState.submissions) {
      const submission = this.gameState.submissions[userId];

      // Random score between 0 and 100
      const score = Math.floor(Math.random() * 101);
      submission.score = score;

      if (score > highestScore) {
        highestScore = score;
        winner = {
          userId: submission.userId,
          userName: submission.userName,
          score,
        };
      }
    }

    this.gameState.winner = winner;
    await this.state.storage.put("gameState", this.gameState);

    // Announce results
    let resultsMessage = "📊 ROUND RESULTS 📊\n\n";

    for (const userId in this.gameState.submissions) {
      const submission = this.gameState.submissions[userId];
      resultsMessage += `${submission.userName}: ${submission.emoji} (Score: ${submission.score})\n`;
    }

    resultsMessage += `\n🏆 WINNER: ${winner!.userName} with ${
      winner!.score
    } points! 🏆`;

    const resultMessage: ChatMessage = {
      userId: "system",
      userName: "System",
      message: resultsMessage,
      timestamp: Date.now(),
      isSystemMessage: true,
    };

    this.messages.push(resultMessage);
    await this.state.storage.put("messages", this.messages);

    // Broadcast game state and results
    this.broadcast(
      JSON.stringify({
        type: "game-state",
        gameState: this.gameState,
      })
    );

    this.broadcast(
      JSON.stringify({
        type: "message",
        message: resultMessage,
      })
    );

    // Wait a bit and start a new round
    setTimeout(async () => {
      if (this.playerCount >= 2) {
        await this.startNewGame();
      }
    }, 10000);
  }

  // End the game
  async endGame(reason: string) {
    if (!this.gameState.isActive) {
      return;
    }

    this.gameState.isActive = false;
    this.gameState.roundEnded = true;
    await this.state.storage.put("gameState", this.gameState);

    const endMessage: ChatMessage = {
      userId: "system",
      userName: "System",
      message: `Game ended: ${reason}`,
      timestamp: Date.now(),
      isSystemMessage: true,
    };

    this.messages.push(endMessage);
    await this.state.storage.put("messages", this.messages);

    this.broadcast(
      JSON.stringify({
        type: "game-state",
        gameState: this.gameState,
      })
    );

    this.broadcast(
      JSON.stringify({
        type: "message",
        message: endMessage,
      })
    );
  }

  // Get a random movie prompt
  getRandomMoviePrompt(): string {
    const index = Math.floor(Math.random() * this.moviePrompts.length);
    return this.moviePrompts[index];
  }

  // Check if a string contains only emojis
  isEmojiOnly(str: string): boolean {
    // This is a simple regex to match most emoji characters
    // A more comprehensive solution would use a proper emoji library
    const emojiRegex = /^[\p{Emoji}]+$/u;
    return emojiRegex.test(str);
  }
}
