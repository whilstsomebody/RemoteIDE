"use client";

import { gatewayFetch, GATEWAY_URL } from "../../lib/api/client";

import React, { useState, useEffect, useCallback } from "react";
import { Shield, User, Lock, Mail, CheckCircle2, AlertCircle, X, LogOut } from "lucide-react";
import { Button, Input } from "@remote-ide/ui";

export interface OwnerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  gatewayUrl?: string;
  onAuthSuccess?: (sessionToken: string, user: { displayName: string; email: string }) => void;
}

export const OwnerAuthModal: React.FC<OwnerAuthModalProps> = ({
  isOpen,
  onClose,
  gatewayUrl = GATEWAY_URL,
  onAuthSuccess,
}) => {
  const [isBootstrapped, setIsBootstrapped] = useState<boolean | null>(null);
  const [localSetupToken, setLocalSetupToken] = useState<string>("");
  const [mode, setMode] = useState<"bootstrap" | "login" | "profile">("bootstrap");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    email: string;
    isOwner: boolean;
  } | null>(null);

  const checkStatus = useCallback(async () => {
    setError(null);
    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/auth/status`);
      if (res.ok) {
        const body = await res.json();
        const bootstrapped = !!body.data?.isBootstrapped;
        setIsBootstrapped(bootstrapped);
        if (body.data?.localSetupToken) {
          setLocalSetupToken(body.data.localSetupToken);
        }

        // Check if current user is logged in
        const token = localStorage.getItem("remote_ide_token") || "";
        if (token) {
          const sessRes = await gatewayFetch(`${gatewayUrl}/api/v1/auth/sessions`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (sessRes.ok) {
            const sessBody = await sessRes.json();
            const current = sessBody.data?.sessions?.find((s: any) => s.isOwner);
            if (current) {
              setCurrentUser({ displayName: "Host Owner", email: "Owner Account", isOwner: true });
              setMode("profile");
              return;
            }
          }
        }

        if (bootstrapped) {
          setMode("login");
        } else {
          setMode("bootstrap");
        }
      }
    } catch {
      setError("Unable to contact gateway authentication service.");
    }
  }, [gatewayUrl]);

  useEffect(() => {
    if (isOpen) {
      void checkStatus();
    }
  }, [isOpen, checkStatus]);

  if (!isOpen) return null;

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let tokenToUse = localSetupToken;
      if (!tokenToUse) {
        try {
          const statusRes = await gatewayFetch(`${gatewayUrl}/api/v1/auth/status`);
          if (statusRes.ok) {
            const sbody = await statusRes.json();
            tokenToUse = sbody.data?.localSetupToken || "";
          }
        } catch {
          // ignore
        }
      }

      const res = await gatewayFetch(`${gatewayUrl}/api/v1/auth/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: displayName.trim() || "Host Owner",
          email: email.trim().toLowerCase(),
          password,
          localSetupToken: tokenToUse,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "Failed to bootstrap owner account");
      }

      const token = body.data?.sessionToken;
      if (token) {
        localStorage.setItem("remote_ide_token", token);
        document.cookie = `remoteide_session=${token}; path=/; max-age=2592000; SameSite=Strict`;
      }

      setSuccessMsg(
        "Owner account created successfully! You are now authenticated as the Host Owner."
      );
      setIsBootstrapped(true);
      setCurrentUser(body.data?.user || { displayName, email, isOwner: true });
      setMode("profile");

      if (onAuthSuccess && token) {
        onAuthSuccess(token, body.data.user);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await gatewayFetch(`${gatewayUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message || "Invalid credentials or unauthorized login attempt");
      }

      const token = body.data?.sessionToken;
      if (token) {
        localStorage.setItem("remote_ide_token", token);
        document.cookie = `remoteide_session=${token}; path=/; max-age=2592000; SameSite=Strict`;
      }

      setSuccessMsg("Successfully signed in as Owner.");
      setCurrentUser(body.data?.user || { displayName: "Owner", email, isOwner: true });
      setMode("profile");

      if (onAuthSuccess && token) {
        onAuthSuccess(token, body.data.user);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem("remote_ide_token") || "";
      if (token) {
        await gatewayFetch(`${gatewayUrl}/api/v1/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        }).catch(() => null);
      }
      localStorage.removeItem("remote_ide_token");
      document.cookie = "remoteide_session=; path=/; max-age=0; SameSite=Strict";
      setCurrentUser(null);
      setMode(isBootstrapped ? "login" : "bootstrap");
      setSuccessMsg("Signed out.");
    } catch {
      //
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in-0 font-sans"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden flex flex-col"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100">
              {mode === "bootstrap"
                ? "Initialize Host Owner Account"
                : mode === "login"
                  ? "Owner Sign In"
                  : "Owner Account Profile"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/80 rounded-md flex items-start gap-2.5 text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-md flex items-start gap-2.5 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === "profile" && (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-950 border border-emerald-600/40 flex items-center justify-center text-emerald-400">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-zinc-200 text-sm">
                    {currentUser?.displayName || "Host Owner"}
                  </div>
                  <div className="text-zinc-400">{currentUser?.email || "Owner Account"}</div>
                  <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] bg-emerald-900/40 text-emerald-300 border border-emerald-700/50 rounded font-mono">
                    ROLE: OWNER (Full Control)
                  </span>
                </div>
              </div>

              <p className="text-zinc-400 leading-relaxed">
                You are currently authenticated as the Host Owner. You have unrestricted execution
                permissions, including interactive terminal access, process management, and share
                link generation.
              </p>

              <div className="pt-2 flex justify-between items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="gap-1.5 text-rose-400 hover:text-rose-300 border-zinc-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </Button>
                <Button variant="primary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {mode === "bootstrap" && (
            <form onSubmit={handleBootstrap} className="space-y-3.5">
              <p className="text-zinc-400 leading-relaxed">
                RemoteIDE requires a primary Host Owner. Because you are accessing directly on this
                host machine, you can bootstrap the owner account now.
              </p>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Your Name / Handle</label>
                <div className="relative">
                  <Input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Aman"
                    className="pl-8"
                  />
                  <User className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Owner Email</label>
                <div className="relative">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="pl-8"
                  />
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Master Password</label>
                <div className="relative">
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pl-8"
                  />
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="pt-2 flex justify-between items-center">
                {isBootstrapped && (
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-zinc-400 hover:text-zinc-200 underline text-xs"
                  >
                    Already initialized? Sign In
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={isSubmitting}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    {isSubmitting ? "Initializing..." : "Create Owner Account"}
                  </Button>
                </div>
              </div>
            </form>
          )}

          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-3.5">
              <p className="text-zinc-400 leading-relaxed">
                Sign in with your Owner credentials to manage share links, terminals, and remote
                sessions.
              </p>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Owner Email</label>
                <div className="relative">
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@example.com"
                    className="pl-8"
                  />
                  <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Password</label>
                <div className="relative">
                  <Input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter owner password"
                    className="pl-8"
                  />
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                >
                  {isSubmitting ? "Signing In..." : "Sign In"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
