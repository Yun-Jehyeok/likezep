import { createApiClient } from "@mentoring/ui";

export const api = createApiClient(import.meta.env.VITE_API_URL ?? "");

export interface CourseListItem {
  id: number;
  category: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  lessonCount: number;
  completedCount: number;
}

export interface LessonItem {
  id: number;
  title: string;
  duration: number | null;
  order: number;
  completed: boolean;
  watchedSeconds: number;
}

export interface MaterialItem {
  id: number;
  name: string;
  fileSize: number | null;
}

export interface CourseDetail {
  id: number;
  category: string;
  title: string;
  description: string | null;
  lessons: LessonItem[];
  materials: MaterialItem[];
  completedCount: number;
  lessonCount: number;
}
