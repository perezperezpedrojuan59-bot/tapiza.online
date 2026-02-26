import { applyToJobAction } from "@/app/actions/jobs";

type ApplyButtonProps = {
  jobId: string;
  disabled?: boolean;
};

export function ApplyButton({ jobId, disabled = false }: ApplyButtonProps) {
  const action = applyToJobAction.bind(null, jobId);
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={disabled}
        className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {disabled ? "Ya postulado" : "Postularme"}
      </button>
    </form>
  );
}
