"use client";

import { gatewayFetch, GATEWAY_URL } from "../../lib/api/client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, Lock, Laptop, CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button, Input } from "@remote-ide/ui";


function ShareRedeemContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [deviceName, setDeviceName] = useState<string>("Remote Collaborator");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    role: string;
    expiresAt: string;
    allowedWorkspaceIds?: string[];
  } | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get("token");
    if (tokenParam) {
      setToken(tokenParam);
      // Keep the bearer share token out of browser history, sync and Referer headers.
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      window.history.replaceState(window.history.state, "", url.toString());
    }

    if (typeof window !== "undefined") {
      const ua = navigator.userAgent;
      let platform = "Browser";
      if (ua.includes("Mac")) platform = "Mac";
      else if (ua.includes("Windows")) platform = "Windows";
      else if (ua.includes("Linux")) platform = "Linux";
      else if (ua.includes("iPad") || ua.includes("iPhone")) platform = "iOS";
      else if (ua.includes("Android")) platform = "Android";

      setDeviceName(`${platform} Device`);
    }
  }, [searchParams]);

  const handleRedeem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token.trim()) {
      setError("Please enter or provide a valid share token.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await gatewayFetch(`${GATEWAY_URL}/api/v1/share-links/redeem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token.trim(),
          pin: pin.trim() || undefined,
          deviceName: deviceName.trim() || "Remote Collaborator",
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error?.message ||
            "Failed to redeem share link. It may be expired, invalid, or already used."
        );
      }

      const session = data.data.session;

      localStorage.setItem("remote_ide_token", data.data.sessionToken);
      localStorage.setItem("remote_ide_role", session.role);
      localStorage.setItem("remote_ide_session_id", session.id);

      setSuccessData({
        role: session.role,
        expiresAt: session.expiresAt,
        allowedWorkspaceIds: session.allowedWorkspaceIds,
      });

      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to redeem access link.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d10] text-zinc-100 flex flex-col justify-center items-center p-4 selection:bg-indigo-500/30">
      <div className="w-full max-w-md bg-[#18181b] border border-zinc-800 rounded-xl shadow-2xl p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500" />

        <div className="flex flex-col items-center text-center mb-6 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="RemoteIDE Logo"
            className="w-12 h-12 object-contain mb-3 drop-shadow"
          />
          <h1 className="text-lg font-semibold text-zinc-100">RemoteIDE Access Portal</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Redeem your temporary access link to collaborate on this remote workspace.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 rounded-md bg-red-950/40 border border-red-800/60 flex items-start gap-2.5 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Redemption Failed</div>
              <div className="text-red-400/90 mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {successData ? (
          <div className="py-6 flex flex-col items-center text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
            <h2 className="text-base font-semibold text-zinc-100">Access Granted!</h2>
            <p className="text-xs text-zinc-400 max-w-xs">
              Role granted:{" "}
              <span className="font-mono text-emerald-400 font-medium uppercase px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60">
                {successData.role}
              </span>
            </p>
            <p className="text-[11px] text-zinc-500">Redirecting to IDE workspace...</p>
          </div>
        ) : (
          <form onSubmit={handleRedeem} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                Access Token
              </label>
              <Input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your base64url token or use full link..."
                className="w-full bg-[#0f0f12] border-zinc-700 text-xs font-mono text-zinc-200"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-zinc-400" />
                Security PIN{" "}
                <span className="text-zinc-500 font-normal">(if required by owner)</span>
              </label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="4-8 digit numeric or alphanumeric PIN"
                className="w-full bg-[#0f0f12] border-zinc-700 text-xs font-mono text-zinc-200"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-zinc-400" />
                Device Name / Identifier
              </label>
              <Input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Alice's MacBook, Reviewer iPad"
                className="w-full bg-[#0f0f12] border-zinc-700 text-xs text-zinc-200"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Visible to the workspace owner in active session audit logs.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !token.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium h-9 flex items-center justify-center gap-2 mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifying Token...
                </>
              ) : (
                <>
                  Connect to Workspace
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center">
          <p className="text-[10px] text-zinc-500">
            Remote IDE access via the host’s outbound tunnel. Zero open inbound ports
            required.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ShareRedeemPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0d0d10] flex items-center justify-center text-zinc-400 text-xs">
          Loading access portal...
        </div>
      }
    >
      <ShareRedeemContent />
    </Suspense>
  );
}
