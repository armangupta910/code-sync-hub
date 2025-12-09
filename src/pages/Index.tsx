import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import CodeTogetherLogo from "@/components/CodeTogetherLogo";
import SectionTitle from "@/components/SectionTitle";
import FormField from "@/components/FormField";
import StatusMessage from "@/components/StatusMessage";
import RoomInfoCard from "@/components/RoomInfoCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import LanguageSelect from "@/components/LanguageSelect";
import { ArrowRight, Search, Sparkles } from "lucide-react";

const API_BASE = "https://code-sync-render.onrender.com";

interface RoomStatus {
  exists: boolean;
  is_full: boolean;
  language: string;
  participants: number;
  max_participants: number;
}

const Index = () => {
  // Create room state
  const [createEmail, setCreateEmail] = useState("");
  const [language, setLanguage] = useState("python");
  const [isCreating, setIsCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);

  // Join room state
  const [joinEmail, setJoinEmail] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinMessage, setJoinMessage] = useState<{ type: "error" | "success" | "info"; text: string } | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus | null>(null);
  const [canJoin, setCanJoin] = useState(false);

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleCreateRoom = async () => {
    if (!createEmail.trim()) {
      setCreateMessage({ type: "error", text: "Please enter your email" });
      return;
    }
    if (!validateEmail(createEmail)) {
      setCreateMessage({ type: "error", text: "Please enter a valid email address" });
      return;
    }

    setIsCreating(true);
    setCreateMessage(null);

    try {
      const response = await fetch(`${API_BASE}/rooms/5`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, client_id: createEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem("clientId", createEmail);
        sessionStorage.setItem("userEmail", createEmail);
        setCreateMessage({ type: "success", text: `Room created! Code: ${data.room_code}. Redirecting...` });
        toast.success("Room created successfully!");
        setTimeout(() => {
          window.location.href = `/room?code=${data.room_code}`;
        }, 1500);
      } else {
        setCreateMessage({ type: "error", text: `Failed to create room: ${data.detail || "Unknown error"}` });
      }
    } catch (error) {
      setCreateMessage({ type: "error", text: "Connection error. Make sure the backend is running." });
    } finally {
      setIsCreating(false);
    }
  };

  const handleCheckRoom = async () => {
    const code = roomCode.trim().toUpperCase();
    if (!code) {
      setJoinMessage({ type: "error", text: "Please enter a room code" });
      return;
    }
    if (code.length !== 6) {
      setJoinMessage({ type: "error", text: "Room code must be 6 characters" });
      return;
    }

    setIsChecking(true);
    setJoinMessage(null);
    setRoomStatus(null);
    setCanJoin(false);

    try {
      const response = await fetch(`${API_BASE}/rooms/${code}/status`);
      const data: RoomStatus = await response.json();

      if (data.exists) {
        setRoomStatus({ ...data });
        if (data.is_full) {
          setJoinMessage({ type: "error", text: "Room is full! Maximum 2 participants allowed." });
          setCanJoin(false);
        } else {
          setJoinMessage({ type: "success", text: "Room found! You can join." });
          setCanJoin(true);
        }
      } else {
        setJoinMessage({ type: "error", text: `Room "${code}" not found. Check the code and try again.` });
      }
    } catch (error) {
      setJoinMessage({ type: "error", text: "Connection error. Make sure the backend is running." });
    } finally {
      setIsChecking(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!joinEmail.trim()) {
      setJoinMessage({ type: "error", text: "Please enter your email" });
      return;
    }
    if (!validateEmail(joinEmail)) {
      setJoinMessage({ type: "error", text: "Please enter a valid email address" });
      return;
    }

    setIsJoining(true);
    setJoinMessage(null);

    try {
      const response = await fetch(`${API_BASE}/rooms/${roomCode.toUpperCase()}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: joinEmail }),
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem("clientId", joinEmail);
        sessionStorage.setItem("userEmail", joinEmail);
        sessionStorage.setItem("participantId", data.participant_id);
        setJoinMessage({ type: "success", text: "Joining room..." });
        toast.success("Joining room!");
        setTimeout(() => {
          window.location.href = `/room?code=${roomCode.toUpperCase()}`;
        }, 800);
      } else {
        if (data.detail?.error === "ROOM_FULL") {
          setJoinMessage({ type: "error", text: "Room is now full. Someone joined before you." });
          setCanJoin(false);
        } else {
          setJoinMessage({ type: "error", text: `Failed to join: ${data.detail || "Unknown error"}` });
        }
      }
    } catch (error) {
      setJoinMessage({ type: "error", text: "Connection error." });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Main Card */}
        <div className="bg-card border border-border rounded-2xl shadow-elevated overflow-hidden animate-fade-up">
          {/* Header */}
          <div className="bg-gradient-to-b from-secondary to-card border-b border-border px-6 sm:px-10 py-8 sm:py-10">
            <div className="flex justify-center">
              <CodeTogetherLogo />
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground font-sans">
              Real-time collaborative coding for pairs
            </p>
          </div>

          {/* Content */}
          <div className="px-6 sm:px-10 py-8 sm:py-10 space-y-8">
            {/* Create Room Section */}
            <section className="space-y-5 animate-fade-up delay-100" style={{ opacity: 0, animationFillMode: 'forwards' }}>
              <SectionTitle>Create New Room</SectionTitle>

              <FormField label="Your Email">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
              </FormField>

              <FormField label="Programming Language">
                <LanguageSelect value={language} onValueChange={setLanguage} />
              </FormField>

              <Button
                variant="gradient"
                className="w-full"
                onClick={handleCreateRoom}
                disabled={isCreating}
              >
                {isCreating ? (
                  <>
                    <LoadingSpinner />
                    Creating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Create Room
                  </>
                )}
              </Button>

              {createMessage && (
                <StatusMessage type={createMessage.type} message={createMessage.text} />
              )}
            </section>

            {/* Divider */}
            <div className="section-divider" />

            {/* Join Room Section */}
            <section className="space-y-5 animate-fade-up delay-200" style={{ opacity: 0, animationFillMode: 'forwards' }}>
              <SectionTitle>Join Existing Room</SectionTitle>

              <FormField label="Your Email">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={joinEmail}
                  onChange={(e) => setJoinEmail(e.target.value)}
                />
              </FormField>

              <FormField label="Room Code">
                <div className="flex gap-3">
                  <Input
                    type="text"
                    placeholder="Enter room code (e.g., ABC123)"
                    maxLength={6}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleCheckRoom()}
                    className="font-mono tracking-widest uppercase"
                  />
                  <Button
                    variant="check"
                    onClick={handleCheckRoom}
                    disabled={isChecking}
                    className="shrink-0"
                  >
                    {isChecking ? <LoadingSpinner /> : <Search className="h-4 w-4" />}
                    Check
                  </Button>
                </div>
              </FormField>

              {roomStatus && roomStatus.exists && !roomStatus.is_full && (
                <RoomInfoCard
                  roomCode={roomCode.toUpperCase()}
                  language={roomStatus.language}
                  participants={roomStatus.participants}
                  maxParticipants={roomStatus.max_participants}
                />
              )}

              {canJoin && (
                <Button
                  variant="gradient"
                  className="w-full animate-scale-in"
                  onClick={handleJoinRoom}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <>
                      <LoadingSpinner />
                      Joining...
                    </>
                  ) : (
                    <>
                      Join Room
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}

              {joinMessage && (
                <StatusMessage type={joinMessage.type} message={joinMessage.text} />
              )}
            </section>
          </div>
        </div>

        {/* Footer text */}
        <p className="mt-6 text-center text-xs text-muted-foreground font-sans animate-fade-in delay-400" style={{ opacity: 0, animationFillMode: 'forwards' }}>
          Powered by real-time collaboration technology
        </p>
      </div>
    </div>
  );
};

export default Index;
