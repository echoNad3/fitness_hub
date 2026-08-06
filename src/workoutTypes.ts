export type WorkoutId = string
export type ResultStatus = 'success' | 'failure'
export type PreviousResult = ResultStatus | 'missing'
export type Category = 'CHEST' | 'BACK' | 'SHOULDERS' | 'BICEPS' | 'TRICEPS' | 'CORE' | 'LEGS'

export type ExerciseVariant = {
  id: string
  name: string
  category: Category
  setup: string
  sets: number
  reps: number
  weight: number
  perHand: boolean
  lastResult: PreviousResult
  note?: string
}
