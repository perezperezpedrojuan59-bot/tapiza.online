import { z } from "zod";

import { APPLICATION_STATUS, JOB_CATEGORIES } from "@/lib/constants";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["worker", "company"]),
  name: z.string().min(2),
  city: z.string().min(2)
});

export const workerProfileSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  phone: z.string().max(30).optional().or(z.literal("")),
  experience: z.string().max(300).optional().or(z.literal("")),
  radius_km: z.coerce.number().int().min(1).max(100),
  categories: z.array(z.enum(JOB_CATEGORIES)).default([]),
  available_today: z.boolean().optional().default(false)
});

export const companyProfileSchema = z.object({
  name: z.string().min(2),
  city: z.string().min(2),
  company_name: z.string().min(2),
  contact_name: z.string().min(2),
  cif: z.string().max(32).optional().or(z.literal(""))
});

export const jobSchema = z.object({
  title: z.string().min(3),
  category: z.enum(JOB_CATEGORIES),
  city: z.string().min(2),
  description: z.string().min(10).max(1000),
  schedule: z.enum(["parcial", "completa"]),
  salary_text: z.string().min(2).max(80),
  start_date: z.string().optional().or(z.literal("")),
  urgent: z.boolean().optional().default(false)
});

export const applicationStatusSchema = z.object({
  status: z.enum(APPLICATION_STATUS)
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1).max(1000)
});
