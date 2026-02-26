import { JOB_CATEGORIES } from "@/lib/constants";
import type { Database } from "@/types/database";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

type JobFormProps = {
  action: (formData: FormData) => void;
  initial?: Partial<JobRow>;
  submitLabel: string;
};

export function JobForm({ action, initial, submitLabel }: JobFormProps) {
  return (
    <form action={action} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block text-sm font-medium">
        Titulo
        <input
          name="title"
          required
          defaultValue={initial?.title ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm font-medium">
        Categoria
        <select
          name="category"
          defaultValue={initial?.category ?? JOB_CATEGORIES[0]}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        >
          {JOB_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Ciudad
        <input
          name="city"
          required
          defaultValue={initial?.city ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="block text-sm font-medium">
        Descripcion
        <textarea
          name="description"
          required
          minLength={10}
          defaultValue={initial?.description ?? ""}
          className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Jornada
          <select
            name="schedule"
            defaultValue={initial?.schedule ?? "parcial"}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="parcial">Parcial</option>
            <option value="completa">Completa</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Salario
          <input
            name="salary_text"
            required
            defaultValue={initial?.salary_text ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm font-medium">
        Fecha de inicio
        <input
          type="date"
          name="start_date"
          defaultValue={initial?.start_date ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="urgent"
          defaultChecked={initial?.urgent ?? false}
          className="h-4 w-4"
        />
        Oferta urgente
      </label>

      <button
        type="submit"
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
      >
        {submitLabel}
      </button>
    </form>
  );
}
