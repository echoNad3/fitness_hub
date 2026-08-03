import type { CSSProperties } from 'react'
import type { Category } from './workoutTypes'

export const CATEGORIES: Category[] = ['CHEST', 'BACK', 'SHOULDERS', 'TRICEPS', 'BICEPS', 'CORE', 'LEGS']

const muscleColors: Record<Category, string> = {
  CHEST: 'var(--muscle-chest)',
  BACK: 'var(--muscle-back)',
  SHOULDERS: 'var(--muscle-shoulders)',
  BICEPS: 'var(--muscle-biceps)',
  TRICEPS: 'var(--muscle-triceps)',
  CORE: 'var(--muscle-core)',
  LEGS: 'var(--muscle-legs)',
}

export type MuscleColorStyle = CSSProperties & { '--muscle-color': string }

const categoryLabels: Record<Category, string> = {
  CHEST: 'Chest',
  BACK: 'Back',
  SHOULDERS: 'Shoulders',
  BICEPS: 'Biceps',
  TRICEPS: 'Triceps',
  CORE: 'Core',
  LEGS: 'Legs',
}

export function muscleColor(category: Category) {
  return muscleColors[category]
}

export function muscleColorStyle(category: Category): MuscleColorStyle {
  return { '--muscle-color': muscleColor(category) }
}

export function categoryLabel(category: Category) {
  return categoryLabels[category]
}
