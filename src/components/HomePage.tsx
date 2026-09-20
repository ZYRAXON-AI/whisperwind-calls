import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Menu, X } from "lucide-react";
import { Backdrop } from "@/components/Backdrop";
import { Sidebar } from "@/components/Sidebar";
import { ChatRoom } from "@/components/chat/ChatRoom";
import FriendsList from "@/components/FriendsList";
import { DMRoom } from "@/components/chat/DMRoom";

interface Props {
  user: User;
  onSignOut: () => void;
}

export function HomePage({ user, onSignOut }: Props) {
  const [activeView, setActiveView] = useState("group");
  const [selectedDM, setSelectedDM] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const showGroup = activeView === "group" && !selectedDM;
  const showFriends = activeView === "friends" && !selectedDM;
  const showRequests = activeView === "requests" && !selectedDM;
  const showDM = !!selectedDM;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden md:flex-row">
      <Backdrop />

      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="glass fixed left-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-xl md:hidden"
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <Sidebar
        user={{ id: user.id }}
        activeView={activeView}
        onSelectView={(v) => { setActiveView(v); setSelectedDM(null); }}
        onSelectDM={(id) => { setSelectedDM(id); }}
        onSignOut={onSignOut}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="flex-1 overflow-hidden">
        {showGroup && <ChatRoom user={user} onSignOut={onSignOut} />}
        {showFriends && <FriendsList user={user} onOpenDM={(id) => setSelectedDM(id)} />}
        {showRequests && <FriendsList user={user} onOpenDM={(id) => setSelectedDM(id)} showRequestsOnly />}
        {showDM && selectedDM && (
          <DMRoom user={user} otherUserId={selectedDM} onBack={() => setSelectedDM(null)} />
        )}
      </main>
    </div>
  );
}
