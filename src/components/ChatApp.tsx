import React, { useState, useEffect } from "react";
import Chat from "./Chat";
import ChatRoomSelector from "./ChatRoomSelector";

interface User {
  id: number;
  name: string;
  email: string;
}

const ChatApp: React.FC = () => {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Simulate fetching the current user
  useEffect(() => {
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

  const handleSelectRoom = (roomId: string) => {
    setSelectedRoom(roomId);
  };

  if (isLoading) {
    return <div className="loading-container">Loading...</div>;
  }

  if (!currentUser) {
    return (
      <div className="error-container">Unable to load user information</div>
    );
  }

  return (
    <div className="chat-app">
      <header className="app-header">
        <h1>HONC Chat App</h1>
        <div className="user-info">
          Logged in as: <span className="user-name">{currentUser.name}</span>
        </div>
      </header>

      <main className="app-main">
        {selectedRoom ? (
          <div className="chat-section">
            <button
              className="back-button"
              onClick={() => setSelectedRoom(null)}
            >
              ← Back to Rooms
            </button>

            <Chat
              roomId={selectedRoom}
              userId={currentUser.id.toString()}
              userName={currentUser.name}
            />
          </div>
        ) : (
          <ChatRoomSelector onSelectRoom={handleSelectRoom} />
        )}
      </main>

      <footer className="app-footer">
        <p>Powered by the HONC Stack with Cloudflare Durable Objects</p>
      </footer>
    </div>
  );
};

export default ChatApp;
