import { updateApplicationStatusAction } from "@/app/actions/jobs";
import { APPLICATION_STATUS } from "@/lib/constants";
import type { ApplicationStatus } from "@/types/database";

type ApplicationStatusFormProps = {
  applicationId: string;
  currentStatus: ApplicationStatus;
};

export function ApplicationStatusForm({
  applicationId,
  currentStatus
}: ApplicationStatusFormProps) {
  const action = updateApplicationStatusAction.bind(null, applicationId);
  return (
    <form action={action} className="flex items-center gap-2">
      <select
        name="status"
        defaultValue={currentStatus}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        {APPLICATION_STATUS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-md border border-slate-300 px-2 py-1 text-sm"
      >
        Guardar
      </button>
    </form>
  );
}
