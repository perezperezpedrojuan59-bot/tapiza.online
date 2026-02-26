type FlashMessageProps = {
  error?: string;
  ok?: string;
  message?: string;
};

export function FlashMessage({ error, ok, message }: FlashMessageProps) {
  const text = error ?? ok ?? message;
  if (!text) return null;

  const style = error
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";

  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${style}`}>
      {decodeURIComponent(text.replace(/\+/g, " "))}
    </div>
  );
}
