"use client";

import { FormEvent, useMemo, useState } from "react";
import { useEffect } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];

type ChatRoomProps = {
  chatId: string;
  currentUserId: string;
  initialMessages: MessageRow[];
};

export function ChatRoom({ chatId, currentUserId, initialMessages }: ChatRoomProps) {
  const [messages, setMessages] = useState<MessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as MessageRow]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel).catch(() => undefined);
    };
  }, [chatId, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setError(null);

    const { error: insertError } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: currentUserId,
      text
    });

    if (insertError) {
      setError(insertError.message);
      return;
    }
    setDraft("");
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-slate-500">Aun no hay mensajes.</p>
        )}
        {messages.map((message) => {
          const mine = message.sender_id === currentUserId;
          return (
            <div
              key={message.id}
              className={cn("flex", mine ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                  mine
                    ? "bg-brand text-white"
                    : "border border-slate-200 bg-slate-100 text-slate-800"
                )}
              >
                <p>{message.text}</p>
                <p
                  className={cn(
                    "mt-1 text-right text-xs",
                    mine ? "text-white/80" : "text-slate-500"
                  )}
                >
                  {new Date(message.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-slate-200 p-3">
        {error && (
          <p className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escribe un mensaje..."
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
