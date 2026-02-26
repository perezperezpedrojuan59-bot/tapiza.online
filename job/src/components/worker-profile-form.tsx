import { JOB_CATEGORIES } from "@/lib/constants";
import type { Database } from "@/types/database";

type WorkerProfileFormProps = {
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  action: (formData: FormData) => void;
};

export function WorkerProfileForm({ profile, action }: WorkerProfileFormProps) {
  const selected = new Set(profile.categories ?? []);

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      encType="multipart/form-data"
    >
      <h2 className="text-base font-semibold">Perfil trabajador</h2>
      <label className="block text-sm font-medium">
        Nombre
        <input
          name="name"
          required
          defaultValue={profile.name}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Ciudad
        <input
          name="city"
          required
          defaultValue={profile.city}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Telefono (opcional)
        <input
          name="phone"
          defaultValue={profile.phone ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Experiencia
        <textarea
          name="experience"
          defaultValue={profile.experience ?? ""}
          className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Radio en KM
        <input
          type="number"
          name="radius_km"
          min={1}
          max={100}
          required
          defaultValue={profile.radius_km}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Categorias</legend>
        <div className="grid grid-cols-2 gap-2">
          {JOB_CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="categories"
                value={category}
                defaultChecked={selected.has(category)}
                className="h-4 w-4"
              />
              {category}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="available_today"
          defaultChecked={profile.available_today}
          className="h-4 w-4"
        />
        Disponible hoy
      </label>
      <label className="block text-sm font-medium">
        Foto (JPG/PNG/WEBP, max 2MB)
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
      >
        Guardar perfil worker
      </button>
    </form>
  );
}
