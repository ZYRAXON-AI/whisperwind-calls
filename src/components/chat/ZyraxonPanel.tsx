import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Check,
  FileCode,
  FolderOpen,
  GitBranch,
  GitMerge,
  GitPullRequest,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Unlock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Conversation } from "./Conversation";
import {
  b64decode,
  ghBranchCreate,
  ghFile,
  ghHeadSha,
  ghPrCreate,
  ghPrMerge,
  ghPrs,
  ghRepo,
  ghTree,
  ghWrite,
  langOf,
  type GhPr,
  type GhTreeItem,
} from "@/lib/github";
import { ZYRAXON_ROOM, type Profile } from "@/lib/social";

const SECRET = "zyraxonai";
const DEFAULT_REPO = "onelpawarai-X/ZYRAXON-AI";
const TOKEN_KEY = "zyraxon-gh-token";
const SECRET_KEY = "zyraxon-ai-unlocked";

export function ZyraxonPanel({
  me,
  profiles,
  onOpenProfile,
  active = true,
  onUnread,
}: {
  me: string;
  profiles: Record<string, Profile> | Profile[];
  onOpenProfile: (id: string) => void;
  active?: boolean;
  onUnread?: (threadKey: string, delta: number) => void;
}) {
  const [tab, setTab] = useState<"chat" | "code">("chat");
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SECRET_KEY) === "1");

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [repo, setRepo] = useState(DEFAULT_REPO);
  const [branch, setBranch] = useState("main");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<GhTreeItem[]>([]);
  const [files, setFiles] = useState<GhTreeItem[]>([]);
  const [current, setCurrent] = useState("");
  const [code, setCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [headSha, setHeadSha] = useState("");
  const headShaRef = useRef("");
  const [checking, setChecking] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prs, setPrs] = useState<GhPr[]>([]);
  const [editorKey, setEditorKey] = useState(0);

  const tokenSaved = () => {
    localStorage.setItem(TOKEN_KEY, token);
    setUnlocked(true);
    sessionStorage.setItem(SECRET_KEY, "1");
    void connect();
  };

  const unlock = () => {
    setUnlocked(true);
    sessionStorage.setItem(SECRET_KEY, "1");
  };

  const connect = useCallback(async () => {
    if (!token) {
      toast.error("Paste your GitHub access token first");
      return;
    }
    setBusy(true);
    try {
      const info = await ghRepo(token, repo);
      const tree = await ghTree(token, info.full, info.branch);
      const sha = await ghHeadSha(token, info.full, info.branch);
      setBranch(info.branch);
      setTree(tree);
      setFiles(tree.filter((t) => t.path.split("/").length === 1));
      setHeadSha(sha);
      headShaRef.current = sha;
      setConnected(true);
      void loadPrs(token);
      localStorage.setItem(TOKEN_KEY, token);
      toast.success(`Connected to ${info.full} · ${info.branch}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }, [token, repo]);

  const loadPrs = useCallback(
    async (tok: string) => {
      try {
        const info = await ghRepo(tok, repo);
        setPrs(await ghPrs(tok, info.full));
      } catch {}
    },
    [repo]
  );

  // Poll the repo head every 15s; when the head moves (someone pushed/merged
  // a PR upstream) we notice and refresh the tree + PR list automatically.
  useEffect(() => {
    if (!connected || !token) return;
    const poll = async () => {
      setChecking(true);
      try {
        const info = await ghRepo(token, repo);
        const sha = await ghHeadSha(token, info.full, info.branch);
        if (sha && sha !== headShaRef.current) {
          headShaRef.current = sha;
          setHeadSha(sha);
          const tree = await ghTree(token, info.full, info.branch);
          setTree(tree);
          setFiles(tree.filter((t) => t.path.split("/").length === 1));
          setBranch(info.branch);
          void loadPrs(token);
          toast.info("Repository updated — files reloaded");
        }
      } catch {} finally {
        setChecking(false);
      }
    };
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [connected, token, repo, loadPrs]);

  async function openFile(item: GhTreeItem) {
    if (!token || !connected) return;
    setBusy(true);
    try {
      const text = await ghFile(token, repo, item.path, branch);
      setCurrent(item.path);
      setCode(text);
      setOriginalCode(text);
      setCommitMsg(`Update ${item.path.split("/").pop() ?? item.path}`);
      setEditorKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open file");
    } finally {
      setBusy(false);
    }
  }

  async function commitToBranch(target: string, sha?: string) {
    if (!token || !current) {
      toast.error("Open a file and write a change first");
      return null;
    }
    const message = commitMsg.trim() || `Update ${current.split("/").pop() ?? current}`;
    await ghWrite(token, repo, current, code, message, target, sha);
    return message;
  }

  async function commit() {
    if (!current) {
      toast.error("Open a file from the repository first");
      return;
    }
    setCommitting(true);
    try {
      const message = await commitToBranch(branch);
      const info = await ghRepo(token, repo);
      const sha = await ghHeadSha(token, info.full, branch);
      headShaRef.current = sha;
      setHeadSha(sha);
      toast.success(`Committed to ${branch}: ${message}`);
      void loadPrs(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }

  async function prCommit() {
    if (!current) {
      toast.error("Open a file first");
      return;
    }
    if (!prTitle.trim()) {
      toast.error("Give the pull request a title");
      return;
    }
    setCommitting(true);
    try {
      const info = await ghRepo(token, repo);
      const name = newBranch.trim() || `edit-${Date.now().toString(36)}`;
      await ghBranchCreate(token, info.full, name, headShaRef.current);
      await commitToBranch(name);
      await ghPrCreate(token, info.full, prTitle.trim(), name, info.branch);
      toast.success(`PR "${prTitle.trim()}" created — waiting for your review`);
      setPrTitle("");
      setNewBranch("");
      void loadPrs(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create PR");
    } finally {
      setCommitting(false);
    }
  }

  async function mergePr(pr: GhPr) {
    setCommitting(true);
    try {
      await ghPrMerge(token, repo, pr.number);
      toast.success(`PR #${pr.number} merged into ${pr.base.ref}`);
      void loadPrs(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not merge PR");
    } finally {
      setCommitting(false);
    }
  }

  async function collapse(path: string) {
    setFiles(tree.filter((t) => t.path.split("/").length === 1 && (t.path === path || t.path.startsWith(path + "/"))));
  }

  const changed = current && code !== originalCode;

  return (
    <div className="flex h-full flex-col gap-2 p-2 sm:p-3">
      {/* Header */}
      <div className="glass-strong flex shrink-0 flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5 sm:px-4 shadow-lg">
        <div className="gradient-romance grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground shadow">
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold leading-tight">ZYRAXON-AI Group</h2>
          <p className="text-xs text-muted-foreground">
            {unlocked ? "Developer lock open · edit & PR live" : "Secret code studio · locked"}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {connected ? "Auto-sync on" : "Not connected"}
        </div>
      </div>

      {/* Tabs */}
      <div className="grid shrink-0 grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTab("chat")}
          className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
            tab === "chat" ? "bg-white/15 text-foreground shadow" : "text-muted-foreground hover:bg-white/10"
          }`}
        >
          Group Chat
        </button>
        <button
          type="button"
          onClick={() => setTab("code")}
          className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
            tab === "code" ? "bg-white/15 text-foreground shadow" : "text-muted-foreground hover:bg-white/10"
          }`}
        >
          <KeyRound className="h-4 w-4" /> Code Studio
          {current && <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{tree.length}</span>}
        </button>
      </div>

      {/* Chat tab */}
      {tab === "chat" && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl">
          <Conversation
            me={me}
            peerId={null}
            profiles={profiles}
            active={active}
            onUnread={onUnread}
            onOpenProfile={onOpenProfile}
            groupKey={ZYRAXON_ROOM}
          />
        </div>
      )}

      {/* Code studio tab */}
      {tab === "code" && !unlocked && (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6 shadow-2xl">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-white/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-center text-lg font-bold">Secret Code Studio</h3>
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Only the project owner can edit code, push and merge PRs here. Chat is open to everyone.
            </p>
            <input
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secret.trim().toLowerCase() === SECRET) unlock();
              }}
              type="password"
              placeholder="Enter group secret"
              className="mt-4 w-full rounded-2xl border border-border bg-input px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
            />
            <button
              type="button"
              onClick={() => (secret.trim().toLowerCase() === SECRET ? unlock() : toast.error("Wrong secret"))}
              className="gradient-romance mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:opacity-90"
            >
              Unlock Editor
            </button>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Incorrect attempts are ignored.</p>
          </div>
        </div>
      )}

      {tab === "code" && unlocked && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {/* Connect row */}
          <div className="glass-strong flex flex-wrap items-center gap-2 rounded-2xl p-2.5 shadow">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-input px-3 py-2">
              <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/repo (e.g. onelpawarai-X/ZYRAXON-AI)"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="GitHub access token (paste)"
              className="min-w-0 flex-1 basis-52 rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
            />
            <button
              type="button"
              onClick={() => void (unlocked ? connect() : tokenSaved())}
              disabled={busy}
              className="gradient-romance flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : connected ? <RefreshCw className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
              {connected ? "Resync" : "Connect"}
            </button>
          </div>

          {/* Browser + editor */}
          <div className="glass-strong flex min-h-0 flex-1 overflow-hidden rounded-2xl shadow">
            {/* File tree */}
            <div className="scroll-soft hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-white/10 p-2 sm:flex">
              <div className="flex items-center gap-1.5 px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <FolderOpen className="h-3.5 w-3.5" /> Files · {branch}
              </div>
              {files.length === 0 && (
                <p className="px-2 text-xs text-muted-foreground">Select a folder or connect first.</p>
              )}
              {files.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => void openFile(f)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                    current === f.path ? "bg-white/15 text-foreground" : "text-muted-foreground hover:bg-white/10"
                  }`}
                >
                  <FileCode className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">{f.path.split("/").pop()}</span>
                </button>
              ))}
            </div>

            {/* Mobile file selector */}
            <div className="flex flex-col gap-2 p-2 sm:hidden">
              <select
                value={current}
                onChange={(e) => {
                  const item = tree.find((t) => t.path === e.target.value);
                  if (item) void openFile(item);
                }}
                className="w-full rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none"
              >
                <option value="">Pick a file…</option>
                {tree.map((t) => (
                  <option key={t.path} value={t.path}>
                    {t.path}
                  </option>
                ))}
              </select>
            </div>

            {/* Editor */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => setCurrent("")} className="text-xs text-muted-foreground">
                    {current || "No file open"}
                  </button>
                  {changed && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">unsaved</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    placeholder="PR branch (optional)"
                    className="hidden w-40 rounded-xl border border-border bg-input px-2 py-1.5 text-xs outline-none md:block"
                  />
                  <input
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="PR title"
                    className="w-44 rounded-xl border border-border bg-input px-2 py-1.5 text-xs outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void prCommit()}
                    disabled={committing}
                    title="Commit to a new branch and open a pull request"
                    className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                  >
                    {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitPullRequest className="h-3.5 w-3.5" />}
                    PR
                  </button>
                </div>
              </div>

              {current ? (
                <>
                  <div className="min-h-0 flex-1">
                    <Editor
                      key={editorKey}
                      height="100%"
                      theme="light"
                      defaultLanguage={langOf(current)}
                      value={code}
                      onChange={(v) => setCode(v ?? "")}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 border-t border-white/10 p-2">
                    <input
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      placeholder="Commit message"
                      className="min-w-0 flex-1 rounded-xl border border-border bg-input px-3 py-2 text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void commit()}
                      disabled={committing || !changed}
                      className="gradient-romance flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-primary-foreground shadow transition hover:opacity-90 disabled:opacity-40"
                    >
                      {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Commit to {branch}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <FileCode className="h-8 w-8" />
                  <p className="text-sm">Pick a file to edit — changes commit straight to {repo}</p>
                </div>
              )}
            </div>
          </div>

          {/* Open PRs */}
          <div className="glass-strong rounded-2xl p-3 shadow">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                <GitPullRequest className="h-4 w-4 text-primary" /> Open Pull Requests
              </h4>
              <span className="text-xs text-muted-foreground">reloads when the repo updates</span>
            </div>
            {prs.length === 0 ? (
              <p className="text-xs text-muted-foreground">No open PRs right now.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {prs.map((pr) => (
                  <div key={pr.number} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2">
                    <GitPullRequest className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        #{pr.number} · {pr.title}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {pr.head.ref} → {pr.base.ref}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void mergePr(pr)}
                      disabled={committing}
                      className="flex shrink-0 items-center gap-1 rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-40"
                    >
                      {committing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitMerge className="h-3.5 w-3.5" />}
                      Merge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}