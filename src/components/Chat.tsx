import React, { useState, useEffect, useRef } from "react";

interface Message {
  userId: string;
  userName: string;
  message: string;
  timestamp: number;
}

interface ChatProps {
  roomId: string;
  userId: string;
  userName: string;
}

const Chat: React.FC<ChatProps> = ({ roomId, userId, userName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Connect to WebSocket when component mounts
  useEffect(() => {
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

    // Cleanup function to close WebSocket when component unmounts
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [roomId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
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

    // Also persist message to database via API
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

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h2>Chat Room: {roomId}</h2>
        <div
          className={`connection-status ${
            connected ? "connected" : "disconnected"
          }`}
        >
          {connected ? "Connected" : "Disconnected"}
        </div>
      </div>

      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="no-messages">No messages yet</div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${
                msg.userId === userId ? "my-message" : "other-message"
              }`}
            >
              <div className="message-header">
                <span className="user-name">{msg.userName}</span>
                <span className="timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="message-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          disabled={!connected}
        />
        <button type="submit" disabled={!connected || !newMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
