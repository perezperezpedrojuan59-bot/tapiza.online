import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

export function toCommaList(values: string[] | null | undefined): string {
  if (!values || values.length === 0) return "-";
  return values.join(", ");
}
