// Main Chat Application Component
const ChatApp = () => {
  const [selectedRoom, setSelectedRoom] = React.useState(null);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Fetch current user
  React.useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        setIsLoading(true);
        // Get the first user from the API
        const response = await fetch("/api/users");
        const data = await response.json();

        if (data.users && data.users.length > 0) {
          setCurrentUser(data.users[0]);
        } else {
          // Use a default user if none exists
          setCurrentUser({
            id: 1,
            name: "Guest User",
            email: "guest@example.com",
          });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        // Fallback to a default user
        setCurrentUser({
          id: 1,
          name: "Guest User",
          email: "guest@example.com",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  const handleSelectRoom = (roomId) => {
    setSelectedRoom(roomId);
  };

  if (isLoading) {
    return React.createElement(
      "div",
      { className: "loading-container" },
      "Loading..."
    );
  }

  if (!currentUser) {
    return React.createElement(
      "div",
      { className: "error-container" },
      "Unable to load user information"
    );
  }

  return React.createElement(
    "div",
    { className: "chat-app" },
    React.createElement(
      "header",
      { className: "app-header" },
      React.createElement("h1", null, "HONC Chat App"),
      React.createElement(
        "div",
        { className: "user-info" },
        "Logged in as: ",
        React.createElement(
          "span",
          { className: "user-name" },
          currentUser.name
        )
      )
    ),
    React.createElement(
      "main",
      { className: "app-main" },
      selectedRoom
        ? React.createElement(
            "div",
            { className: "chat-section" },
            React.createElement(
              "button",
              {
                className: "back-button",
                onClick: () => setSelectedRoom(null),
              },
              "← Back to Rooms"
            ),
            React.createElement(Chat, {
              roomId: selectedRoom,
              userId: currentUser.id.toString(),
              userName: currentUser.name,
            })
          )
        : React.createElement(ChatRoomSelector, {
            onSelectRoom: handleSelectRoom,
          })
    ),
    React.createElement(
      "footer",
      { className: "app-footer" },
      React.createElement(
        "p",
        null,
        "Powered by the HONC Stack with Cloudflare Durable Objects"
      )
    )
  );
};

// Chat Room Selector Component
const ChatRoomSelector = ({ onSelectRoom }) => {
  const [rooms, setRooms] = React.useState([]);
  const [newRoomId, setNewRoomId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  // Fetch available rooms
  React.useEffect(() => {
    const fetchRooms = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/chat/rooms");
        if (!response.ok) {
          throw new Error("Failed to fetch chat rooms");
        }
        const data = await response.json();
        setRooms(data.rooms || []);
        setError(null);
      } catch (err) {
        setError("Error loading chat rooms");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRooms();
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();

    if (!newRoomId.trim()) return;

    // Check if room already exists
    if (rooms.includes(newRoomId)) {
      onSelectRoom(newRoomId);
      return;
    }

    // Add the new room to the list and select it
    setRooms([...rooms, newRoomId]);
    onSelectRoom(newRoomId);
    setNewRoomId("");
  };

  if (loading) {
    return React.createElement(
      "div",
      { className: "loading" },
      "Loading rooms..."
    );
  }

  if (error) {
    return React.createElement("div", { className: "error" }, error);
  }

  return React.createElement(
    "div",
    { className: "chat-room-selector" },
    React.createElement("h2", null, "Chat Rooms"),
    React.createElement(
      "div",
      { className: "rooms-list" },
      rooms.length === 0
        ? React.createElement(
            "div",
            { className: "no-rooms" },
            "No rooms available. Create one below!"
          )
        : React.createElement(
            "ul",
            null,
            rooms.map((room) =>
              React.createElement(
                "li",
                { key: room },
                React.createElement(
                  "button",
                  {
                    className: "room-button",
                    onClick: () => onSelectRoom(room),
                  },
                  room
                )
              )
            )
          )
    ),
    React.createElement(
      "div",
      { className: "create-room" },
      React.createElement("h3", null, "Create or Join Room"),
      React.createElement(
        "form",
        { onSubmit: handleCreateRoom },
        React.createElement("input", {
          type: "text",
          value: newRoomId,
          onChange: (e) => setNewRoomId(e.target.value),
          placeholder: "Enter room ID",
          required: true,
        }),
        React.createElement(
          "button",
          { type: "submit" },
          rooms.includes(newRoomId) ? "Join Room" : "Create Room"
        )
      )
    )
  );
};

// Chat Component
const Chat = ({ roomId, userId, userName }) => {
  const [messages, setMessages] = React.useState([]);
  const [newMessage, setNewMessage] = React.useState("");
  const [connected, setConnected] = React.useState(false);
  const socketRef = React.useRef(null);
  const messagesEndRef = React.useRef(null);

  // Connect to WebSocket
  React.useEffect(() => {
    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/api/chat/room/${roomId}/websocket`;

      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket connected");
        setConnected(true);
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "history") {
          setMessages(data.messages);
        } else if (data.type === "message") {
          setMessages((prev) => [...prev, data.message]);
        }
      };

      socket.onclose = () => {
        console.log("WebSocket disconnected");
        setConnected(false);
        // Attempt to reconnect after a delay
        setTimeout(connectWebSocket, 5000);
      };

      socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        socket.close();
      };

      socketRef.current = socket;
    };

    connectWebSocket();

    // Cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [roomId]);

  // Scroll to bottom when new messages
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !socketRef.current || !connected) return;

    // Send message through WebSocket
    socketRef.current.send(
      JSON.stringify({
        type: "message",
        userId,
        userName,
        message: newMessage,
      })
    );

    // Also persist message to database
    fetch(`/api/chat/room/${roomId}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        userName,
        content: newMessage,
      }),
    });

    // Clear input field
    setNewMessage("");
  };

  return React.createElement(
    "div",
    { className: "chat-container" },
    React.createElement(
      "div",
      { className: "chat-header" },
      React.createElement("h2", null, `Chat Room: ${roomId}`),
      React.createElement(
        "div",
        {
          className: `connection-status ${
            connected ? "connected" : "disconnected"
          }`,
        },
        connected ? "Connected" : "Disconnected"
      )
    ),
    React.createElement(
      "div",
      { className: "messages-container" },
      messages.length === 0
        ? React.createElement(
            "div",
            { className: "no-messages" },
            "No messages yet"
          )
        : messages.map((msg, index) =>
            React.createElement(
              "div",
              {
                key: index,
                className: `message ${
                  msg.userId === userId ? "my-message" : "other-message"
                }`,
              },
              React.createElement(
                "div",
                { className: "message-header" },
                React.createElement(
                  "span",
                  { className: "user-name" },
                  msg.userName
                ),
                React.createElement(
                  "span",
                  { className: "timestamp" },
                  new Date(msg.timestamp).toLocaleTimeString()
                )
              ),
              React.createElement(
                "div",
                { className: "message-content" },
                msg.message
              )
            )
          ),
      React.createElement("div", { ref: messagesEndRef })
    ),
    React.createElement(
      "form",
      { className: "message-form", onSubmit: handleSendMessage },
      React.createElement("input", {
        type: "text",
        value: newMessage,
        onChange: (e) => setNewMessage(e.target.value),
        placeholder: "Type a message...",
        disabled: !connected,
      }),
      React.createElement(
        "button",
        {
          type: "submit",
          disabled: !connected || !newMessage.trim(),
        },
        "Send"
      )
    )
  );
};

// Render the app
ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(ChatApp)
);
