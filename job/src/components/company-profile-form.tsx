import type { Database } from "@/types/database";

type CompanyProfileFormProps = {
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  action: (formData: FormData) => void;
};

export function CompanyProfileForm({ profile, action }: CompanyProfileFormProps) {
  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
      encType="multipart/form-data"
    >
      <h2 className="text-base font-semibold">Perfil empresa</h2>
      <label className="block text-sm font-medium">
        Nombre publico
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
        Nombre empresa
        <input
          name="company_name"
          required
          defaultValue={profile.company_name ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Persona contacto
        <input
          name="contact_name"
          required
          defaultValue={profile.contact_name ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        CIF (opcional)
        <input
          name="cif"
          defaultValue={profile.cif ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm font-medium">
        Logo (JPG/PNG/WEBP, max 2MB)
        <input
          type="file"
          name="logo"
          accept="image/jpeg,image/png,image/webp"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
      >
        Guardar perfil empresa
      </button>
    </form>
  );
}
