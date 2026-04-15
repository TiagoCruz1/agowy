import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Converte uma string de data UTC para Date no fuso de Brasília
export function toBrasiliaDate(dateStr: string): Date {
  const date = new Date(dateStr);
  // Ajusta para UTC-3 (Brasília)
  const offset = -3 * 60; // minutos
  const utcMinutes = date.getTime() / 60000;
  const brasiliaMs = (utcMinutes + offset) * 60000;
  // Cria uma data "falsa" com o horário correto de Brasília
  const brasilia = new Date(date.getTime());
  brasilia.setTime(brasilia.getTime() + offset * 60000);
  return brasilia;
}

// Formata data/hora para exibição em Brasília
export function formatBrasilia(dateStr: string, fmt: "date" | "time" | "datetime" | "short"): string {
  // Converte UTC para horário de Brasília (UTC-3)
  const date = new Date(dateStr);
  const brasiliaOffset = -3 * 60;
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const brasiliaMinutes = utcMinutes + brasiliaOffset;
  const totalMinutes = ((brasiliaMinutes % 1440) + 1440) % 1440;
  
  let day = date.getUTCDate();
  let month = date.getUTCMonth() + 1;
  let year = date.getUTCFullYear();
  
  // Ajusta o dia se a hora ficou negativa
  if (brasiliaMinutes < 0) {
    const prevDay = new Date(date);
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    day = prevDay.getUTCDate();
    month = prevDay.getUTCMonth() + 1;
    year = prevDay.getUTCFullYear();
  }
  
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const min = String(totalMinutes % 60).padStart(2, "0");
  
  if (fmt === "date" || fmt === "short") return `${dd}/${mm}`;
  if (fmt === "time") return `${hh}:${min}`;
  if (fmt === "datetime") return `${dd}/${mm} ${hh}:${min}`;
  return `${dd}/${mm} ${hh}:${min}`;
}

// Cria um Date local sem conversão de fuso (para inputs de formulário)
export function localDateFromInput(dateStr: string, timeStr: string): string {
  // Cria o timestamp como se fosse Brasília e converte para UTC
  const localStr = `${dateStr}T${timeStr}:00`;
  const localDate = new Date(localStr + "-03:00");
  return localDate.toISOString();
}
