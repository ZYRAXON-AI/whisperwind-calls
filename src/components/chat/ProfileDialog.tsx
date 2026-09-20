import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadMedia } from "@/lib/media";

export type Profile = { id: string; display_name: string; avatar_url: string | null };

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  avatarSrc,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile;
  avatarSrc: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(profile.display_name);
  const [preview, setPreview] = useState(avatarSrc);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadMedia(profile.id, file);
      setAvatarPath(path);
      setPreview(await signedUrl(path));
    } catch {
      toast.error("Could not upload that picture");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim() || "Someone",
        ...(avatarPath ? { avatar_url: avatarPath } : {}),
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error("Could not save your profile");
      return;
    }
    toast.success("Profile updated");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong rounded-3xl border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 pt-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative h-24 w-24 overflow-hidden rounded-full border border-border"
          >
            {preview ? (
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="gradient-romance grid h-full w-full place-items-center text-2xl font-semibold text-primary-foreground">
                {name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition group-hover:opacity-100">
              <Camera className="h-6 w-6" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-2xl border border-border bg-input px-4 py-3 text-center text-sm outline-none focus:ring-2 focus:ring-ring/50"
          />

          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="gradient-romance inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
