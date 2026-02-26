import Link from "next/link";
import { redirect } from "next/navigation";

import { ChatRoom } from "@/components/chat-room";
import { FlashMessage } from "@/components/flash-message";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChatPageProps = {
  params: { id: string };
  searchParams?: { error?: string; ok?: string };
};

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const { session } = await getCurrentProfile();
  if (!session) redirect("/auth/login");

  const supabase = createSupabaseServerClient();
  const { data: chat } = await supabase
    .from("chats")
    .select("id, job_id, company_id, worker_id")
    .eq("id", params.id)
    .single();

  if (!chat) redirect("/panel?error=Chat+no+encontrado");
  if (chat.company_id !== session.user.id && chat.worker_id !== session.user.id) {
    redirect("/panel?error=No+tienes+permiso+para+este+chat");
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("chat_id", chat.id)
    .order("created_at", { ascending: true });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chat candidatura</h1>
        <Link
          href={`/offers/${chat.job_id}`}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
        >
          Ver oferta
        </Link>
      </div>
      <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />
      <ChatRoom
        chatId={chat.id}
        currentUserId={session.user.id}
        initialMessages={messages ?? []}
      />
    </section>
  );
}
