import type { ApplicationStatus, UserRole } from "@/types/database";

export type Actor = {
  id: string;
  role: UserRole;
};

export type WorkerState = {
  id: string;
  availableToday: boolean;
};

export type JobInput = {
  title: string;
  companyId: string;
};

export type JobState = JobInput & {
  id: string;
};

export type ApplicationState = {
  id: string;
  jobId: string;
  workerId: string;
  status: ApplicationStatus;
};

export type ChatState = {
  id: string;
  jobId: string;
  companyId: string;
  workerId: string;
};

export class CurranteMvpService {
  private jobCounter = 0;
  private applicationCounter = 0;
  private chatCounter = 0;
  private jobs = new Map<string, JobState>();
  private applications = new Map<string, ApplicationState>();
  private chats = new Map<string, ChatState>();
  private workers = new Map<string, WorkerState>();

  registerWorker(workerId: string, availableToday = false) {
    this.workers.set(workerId, { id: workerId, availableToday });
  }

  createJob(actor: Actor, input: JobInput) {
    if (actor.role !== "company" || actor.id !== input.companyId) {
      throw new Error("Only company owner can create jobs.");
    }

    const id = `job-${++this.jobCounter}`;
    const job: JobState = { ...input, id };
    this.jobs.set(id, job);
    return job;
  }

  applyToJob(actor: Actor, jobId: string) {
    if (actor.role !== "worker") {
      throw new Error("Only workers can apply.");
    }
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error("Job not found.");
    }

    const existing = [...this.applications.values()].find(
      (item) => item.jobId === jobId && item.workerId === actor.id
    );
    if (existing) return existing;

    const id = `app-${++this.applicationCounter}`;
    const application: ApplicationState = {
      id,
      jobId,
      workerId: actor.id,
      status: "applied"
    };
    this.applications.set(id, application);
    this.createChatForApplication(job, application);
    return application;
  }

  canEditJob(actor: Actor, jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    return actor.role === "company" && actor.id === job.companyId;
  }

  canAccessChat(actor: Actor, chatId: string): boolean {
    const chat = this.chats.get(chatId);
    if (!chat) return false;
    return actor.id === chat.companyId || actor.id === chat.workerId;
  }

  toggleAvailableToday(actor: Actor) {
    if (actor.role !== "worker") {
      throw new Error("Only workers can toggle availability.");
    }
    const worker = this.workers.get(actor.id);
    if (!worker) {
      throw new Error("Worker not registered.");
    }
    worker.availableToday = !worker.availableToday;
    this.workers.set(actor.id, worker);
    return worker.availableToday;
  }

  getChats() {
    return [...this.chats.values()];
  }

  private createChatForApplication(job: JobState, application: ApplicationState) {
    const existing = [...this.chats.values()].find(
      (chat) => chat.jobId === job.id && chat.workerId === application.workerId
    );
    if (existing) return existing;

    const id = `chat-${++this.chatCounter}`;
    const chat: ChatState = {
      id,
      jobId: job.id,
      companyId: job.companyId,
      workerId: application.workerId
    };
    this.chats.set(id, chat);
    return chat;
  }
}
