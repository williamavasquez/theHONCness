import React, { useState, useEffect } from "react";

interface ChatRoomSelectorProps {
  onSelectRoom: (roomId: string) => void;
}

const ChatRoomSelector: React.FC<ChatRoomSelectorProps> = ({
  onSelectRoom,
}) => {
  const [rooms, setRooms] = useState<string[]>([]);
  const [newRoomId, setNewRoomId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available rooms when component mounts
  useEffect(() => {
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

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newRoomId.trim()) return;

    // Check if room already exists
    if (rooms.includes(newRoomId)) {
      onSelectRoom(newRoomId);
      return;
    }

    // Add the new room to the list and select it
    setRooms((prev) => [...prev, newRoomId]);
    onSelectRoom(newRoomId);
    setNewRoomId("");
  };

  return (
    <div className="chat-room-selector">
      <h2>Chat Rooms</h2>

      {loading ? (
        <div className="loading">Loading rooms...</div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : (
        <>
          <div className="rooms-list">
            {rooms.length === 0 ? (
              <div className="no-rooms">
                No rooms available. Create one below!
              </div>
            ) : (
              <ul>
                {rooms.map((room) => (
                  <li key={room}>
                    <button
                      className="room-button"
                      onClick={() => onSelectRoom(room)}
                    >
                      {room}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="create-room">
            <h3>Create or Join Room</h3>
            <form onSubmit={handleCreateRoom}>
              <input
                type="text"
                value={newRoomId}
                onChange={(e) => setNewRoomId(e.target.value)}
                placeholder="Enter room ID"
                required
              />
              <button type="submit">
                {rooms.includes(newRoomId) ? "Join Room" : "Create Room"}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default ChatRoomSelector;
