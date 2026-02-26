import { CurranteMvpService } from "@/lib/domain/mvp";

describe("CurranteMvpService", () => {
  it("crear oferta por empresa", () => {
    const service = new CurranteMvpService();
    const job = service.createJob(
      { id: "company-1", role: "company" },
      { title: "Camarero turno manana", companyId: "company-1" }
    );

    expect(job.id).toMatch(/^job-/);
    expect(job.companyId).toBe("company-1");
  });

  it("postular crea candidatura y chat", () => {
    const service = new CurranteMvpService();
    const job = service.createJob(
      { id: "company-1", role: "company" },
      { title: "Mozo almacen", companyId: "company-1" }
    );

    const application = service.applyToJob(
      { id: "worker-1", role: "worker" },
      job.id
    );

    expect(application.status).toBe("applied");
    expect(service.getChats()).toHaveLength(1);
  });

  it("worker no puede editar oferta", () => {
    const service = new CurranteMvpService();
    const job = service.createJob(
      { id: "company-1", role: "company" },
      { title: "Limpieza oficinas", companyId: "company-1" }
    );

    const canEdit = service.canEditJob(
      { id: "worker-1", role: "worker" },
      job.id
    );
    expect(canEdit).toBe(false);
  });

  it("chat solo participantes", () => {
    const service = new CurranteMvpService();
    const job = service.createJob(
      { id: "company-1", role: "company" },
      { title: "Ayudante cocina", companyId: "company-1" }
    );
    service.applyToJob({ id: "worker-1", role: "worker" }, job.id);
    const chat = service.getChats()[0];

    expect(service.canAccessChat({ id: "company-1", role: "company" }, chat.id)).toBe(
      true
    );
    expect(service.canAccessChat({ id: "worker-1", role: "worker" }, chat.id)).toBe(
      true
    );
    expect(service.canAccessChat({ id: "worker-2", role: "worker" }, chat.id)).toBe(
      false
    );
  });

  it("available_today toggle worker", () => {
    const service = new CurranteMvpService();
    service.registerWorker("worker-1", false);

    const first = service.toggleAvailableToday({ id: "worker-1", role: "worker" });
    const second = service.toggleAvailableToday({ id: "worker-1", role: "worker" });

    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
