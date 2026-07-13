import type { Category } from './workoutTypes'

export const CATEGORIES: Category[] = ['CHEST', 'BACK', 'SHOULDERS', 'BICEPS', 'TRICEPS', 'CORE', 'LEGS']

const muscleColors: Record<Category, string> = {
  CHEST: '#d6b252',
  BACK: '#b9c2cb',
  SHOULDERS: '#a37f50',
  BICEPS: '#aa9fc9',
  TRICEPS: '#d98c4e',
  CORE: '#e48fbf',
  LEGS: '#e48fbf',
}

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

export function categoryLabel(category: Category) {
  return categoryLabels[category]
}
