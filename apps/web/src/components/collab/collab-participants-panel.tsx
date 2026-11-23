"use client";

import React, { useState } from "react";
import {
  CollabParticipant,
  CollabRole,
  CollabConflictStatus,
  CollabComment,
  CollabProposedChange,
} from "@remote-ide/shared";
import {
  Users,
  Eye,
  EyeOff,
  UserX,
  Shield,
  Edit3,
  AlertTriangle,
  MessageSquare,
  FileCheck,
  Send,
  Check,
  X,
} from "lucide-react";
import { Button, cn } from "@remote-ide/ui";

export interface CollabParticipantsPanelProps {
  participants: CollabParticipant[];
  currentUserId: string;
  currentRole: CollabRole;
  filePath: string;
  followingUserId: string | null;
  conflictStatus: CollabConflictStatus | null;
  comments?: CollabComment[];
  proposals?: CollabProposedChange[];
  onFollowUser: (userId: string | null) => void;
  onAssignRole?: (targetUserId: string, newRole: CollabRole) => void;
  onKickParticipant?: (targetUserId: string) => void;
  onRequestEditControl?: () => void;
  onResolveConflict?: (resolution: "reload_disk" | "force_crdt" | "merge") => void;
  onAddComment?: (line: number, text: string) => void;
  onApplyProposal?: (proposalId: string) => void;
}

export const CollabParticipantsPanel: React.FC<CollabParticipantsPanelProps> = ({
  participants,
  currentUserId,
  currentRole,
  filePath: _filePath,
  followingUserId,
  conflictStatus,
  comments = [],
  proposals = [],
  onFollowUser,
  onAssignRole,
  onKickParticipant,
  onRequestEditControl,
  onResolveConflict,
  onAddComment,
  onApplyProposal,
}) => {
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [showProposals, setShowProposals] = useState(false);
  const [newCommentText, setNewCommentText] = useState("");
  const [newCommentLine, setNewCommentLine] = useState(1);

  const isOwner = currentRole === "owner";
  const isViewer = currentRole === "viewer";

  return (
    <div className="flex flex-col border-b border-zinc-800 bg-zinc-950/90 text-xs select-none">
      {conflictStatus && conflictStatus.conflictDetected && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-950/60 border-b border-amber-800/80 text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              External file change detected on host disk (via Git or external editor).
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onResolveConflict && (
              <>
                <button
                  onClick={() => onResolveConflict("reload_disk")}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-medium border border-zinc-700"
                  title="Overwrite collaborative document with disk contents"
                >
                  Reload from Disk
                </button>
                <button
                  onClick={() => onResolveConflict("force_crdt")}
                  className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-medium"
                  title="Overwrite host disk with collaborative CRDT document"
                >
                  Keep Collaborative Version
                </button>
                <button
                  onClick={() => onResolveConflict("merge")}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] border border-zinc-700"
                  title="3-way line union merge"
                >
                  Merge Changes
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-3 h-8">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 text-zinc-400 text-[11px] mr-1">
            <Users className="w-3.5 h-3.5" />
            <span>{participants.length} Active:</span>
          </div>

          {participants.map((p) => {
            const isSelf = p.id === currentUserId;
            const isFollowingThis = followingUserId === p.id;

            return (
              <div key={p.id} className="relative inline-block">
                <div
                  onClick={() => setShowDropdown(showDropdown === p.id ? null : p.id)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded-full border cursor-pointer transition-colors text-[11px]",
                    isSelf
                      ? "bg-zinc-900 border-zinc-700 text-zinc-200"
                      : "bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  )}
                  style={{ borderLeftColor: p.color, borderLeftWidth: "3px" }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="font-mono text-[10px] max-w-[80px] truncate">
                    {p.name} {isSelf && "(You)"}
                  </span>
                  <span className="text-[9px] uppercase px-1 rounded bg-zinc-800 text-zinc-400 font-semibold">
                    {p.role}
                  </span>
                  {isFollowingThis && <Eye className="w-3 h-3 text-sky-400 animate-pulse ml-0.5" />}
                </div>

                {showDropdown === p.id && (
                  <div className="absolute left-0 top-full mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded shadow-xl z-50 p-1.5 space-y-1 font-sans">
                    <div className="text-[10px] text-zinc-400 px-2 py-1 border-b border-zinc-800">
                      {p.name} ({p.role})
                    </div>

                    {!isSelf && (
                      <button
                        onClick={() => {
                          onFollowUser(isFollowingThis ? null : p.id);
                          setShowDropdown(null);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1 text-left text-zinc-200 hover:bg-zinc-800 rounded text-xs"
                      >
                        {isFollowingThis ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Stop Following</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-sky-400" />
                            <span>Follow Cursor</span>
                          </>
                        )}
                      </button>
                    )}

                    {isOwner && !isSelf && onAssignRole && (
                      <div className="pt-1 border-t border-zinc-800 space-y-0.5">
                        <div className="text-[9px] uppercase text-zinc-500 px-2">Assign Role</div>
                        {p.role !== "editor" && (
                          <button
                            onClick={() => {
                              onAssignRole(p.id, "editor");
                              setShowDropdown(null);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-0.5 text-left text-zinc-300 hover:bg-zinc-800 rounded text-xs"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Make Editor</span>
                          </button>
                        )}
                        {p.role !== "viewer" && (
                          <button
                            onClick={() => {
                              onAssignRole(p.id, "viewer");
                              setShowDropdown(null);
                            }}
                            className="w-full flex items-center gap-2 px-2 py-0.5 text-left text-zinc-300 hover:bg-zinc-800 rounded text-xs"
                          >
                            <Shield className="w-3.5 h-3.5 text-amber-400" />
                            <span>Make Viewer</span>
                          </button>
                        )}
                      </div>
                    )}

                    {isOwner && !isSelf && onKickParticipant && (
                      <div className="pt-1 border-t border-zinc-800">
                        <button
                          onClick={() => {
                            onKickParticipant(p.id);
                            setShowDropdown(null);
                          }}
                          className="w-full flex items-center gap-2 px-2 py-1 text-left text-rose-400 hover:bg-rose-950/40 rounded text-xs"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Remove from Session</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isViewer && onRequestEditControl && (
            <button
              onClick={onRequestEditControl}
              className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium"
            >
              Request Edit Control
            </button>
          )}

          <button
            onClick={() => setShowComments(!showComments)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors",
              showComments
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            )}
            title="Line comments on shared code"
          >
            <MessageSquare className="w-3 h-3" />
            <span>Comments</span>
            {comments.length > 0 && (
              <span className="px-1 bg-zinc-800 rounded text-[10px] text-zinc-300">
                {comments.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowProposals(!showProposals)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] transition-colors",
              showProposals
                ? "bg-zinc-800 border-zinc-700 text-zinc-100"
                : "border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            )}
            title="Proposed changes from viewers"
          >
            <FileCheck className="w-3 h-3" />
            <span>Proposals</span>
            {proposals.length > 0 && (
              <span className="px-1 bg-zinc-800 rounded text-[10px] text-zinc-300">
                {proposals.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {showComments && (
        <div className="p-3 bg-zinc-900/90 border-t border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span>Code Comments</span>
            <button
              onClick={() => setShowComments(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {comments.length === 0 ? (
              <div className="text-zinc-500 italic text-[11px]">
                No comments on this document yet.
              </div>
            ) : (
              comments.map((c) => (
                <div
                  key={c.id}
                  className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                    <span className="font-medium text-zinc-200">
                      {c.authorName} on line {c.line}:
                    </span>
                    <span>{new Date(c.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-zinc-300">{c.text}</div>
                </div>
              ))
            )}
          </div>

          {onAddComment && (
            <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
              <input
                type="number"
                min={1}
                value={newCommentLine}
                onChange={(e) => setNewCommentLine(parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-zinc-200 text-xs font-mono"
                title="Line number"
              />
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Add a comment on this line..."
                className="flex-1 px-2 py-1 bg-zinc-950 border border-zinc-700 rounded text-zinc-200 text-xs placeholder:text-zinc-600"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newCommentText.trim()) {
                    onAddComment(newCommentLine, newCommentText.trim());
                    setNewCommentText("");
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (newCommentText.trim()) {
                    onAddComment(newCommentLine, newCommentText.trim());
                    setNewCommentText("");
                  }
                }}
                disabled={!newCommentText.trim()}
                className="h-7 px-2 text-zinc-300"
              >
                <Send className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {showProposals && (
        <div className="p-3 bg-zinc-900/90 border-t border-zinc-800 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-300">
            <span>Proposed Changes</span>
            <button
              onClick={() => setShowProposals(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
            {proposals.length === 0 ? (
              <div className="text-zinc-500 italic text-[11px]">
                No pending proposals from viewers.
              </div>
            ) : (
              proposals.map((pr) => (
                <div
                  key={pr.id}
                  className="p-2 rounded bg-zinc-950 border border-zinc-800 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between text-zinc-400 text-[10px]">
                    <span className="font-medium text-zinc-200">
                      Proposal from {pr.authorName} ({pr.status})
                    </span>
                    {!isViewer && pr.status === "pending" && onApplyProposal && (
                      <button
                        onClick={() => onApplyProposal(pr.id)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px]"
                      >
                        <Check className="w-3 h-3" />
                        <span>Apply</span>
                      </button>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-rose-400 bg-rose-950/30 p-1 rounded">
                    - {pr.originalText}
                  </div>
                  <div className="font-mono text-[10px] text-emerald-400 bg-emerald-950/30 p-1 rounded">
                    + {pr.proposedText}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

