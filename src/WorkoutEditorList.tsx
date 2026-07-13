import { useRef, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_STEP_SECONDS,
  clampRestValue,
} from './domain'
import { haptics } from './haptics'
import { formatTimerDuration } from './timeFormat'
import { useHoldStepper } from './useHoldStepper'
import type { ExerciseVariant } from './workoutTypes'
import { CATEGORIES, categoryLabel, muscleColor } from './workoutPresentation'

const MAX_EXERCISE_COUNT = 999

type IconComponent = ComponentType<{ name: string; size?: number }>

export type WorkoutEditorItem = {
  id: string
  variant: ExerciseVariant
  restSeconds: number
  hidden: boolean
  linkedPartnerName?: string
  isExpanded: boolean
  canRemove: boolean
  canLink: boolean
  canToggleHidden: boolean
  onToggle: () => void
  onVariant: (patch: Partial<ExerciseVariant>) => void
  onRest: (value: number) => void
  onRemove: () => void
  onToggleHidden: () => void
  onLink: () => void
  onUnlink: () => void
}

type WorkoutEditorListProps = {
  items: WorkoutEditorItem[]
  Icon: IconComponent
  onReorder: (activeId: string, overId: string) => void
}

const blurOnEnter = (event: { key: string; currentTarget: HTMLInputElement }) => {
  if (event.key === 'Enter') event.currentTarget.blur()
}

const roundWeight = (value: number) => Math.round(value * 100) / 100

function VariantFields({
  variant,
  onPatch,
  Icon,
}: {
  variant: ExerciseVariant
  onPatch: (patch: Partial<ExerciseVariant>) => void
  Icon: IconComponent
}) {
  const { name, category, setup, sets, reps, weight, perHand } = variant
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [setupDraft, setSetupDraft] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<string | null>(null)
  const [weightDraft, setWeightDraft] = useState<string | null>(null)
  const setsRef = useRef(sets)
  const repsRef = useRef(reps)
  setsRef.current = sets
  repsRef.current = reps
  const holdStepper = useHoldStepper()

  const adjustSets = (delta: number) => {
    const next = Math.min(MAX_EXERCISE_COUNT, Math.max(1, setsRef.current + delta))
    if (next === setsRef.current) return false
    setsRef.current = next
    onPatch({ sets: next })
    return true
  }

  const adjustReps = (delta: number) => {
    const next = Math.min(MAX_EXERCISE_COUNT, Math.max(1, repsRef.current + delta))
    if (next === repsRef.current) return false
    repsRef.current = next
    onPatch({ reps: next })
    return true
  }

  const commitName = () => {
    if (nameDraft === null) return
    const nextName = nameDraft.trim()
    if (!nextName) {
      void haptics.reject()
      setNameDraft(null)
      return
    }
    if (nextName !== name) onPatch({ name: nextName })
    setNameDraft(null)
  }

  const commitSetup = () => {
    if (setupDraft === null) return
    const nextSetup = setupDraft.trim()
    if (nextSetup !== setup) onPatch({ setup: nextSetup })
    setSetupDraft(null)
  }

  const commitNote = () => {
    if (noteDraft === null) return
    const trimmed = noteDraft.trim()
    const nextNote = trimmed === '' ? undefined : trimmed
    if (nextNote !== variant.note) onPatch({ note: nextNote })
    setNoteDraft(null)
  }

  const commitWeight = () => {
    if (weightDraft === null) return
    const parsed = Number(weightDraft)
    if (weightDraft.trim() !== '' && Number.isFinite(parsed) && parsed >= 0) {
      const nextWeight = roundWeight(parsed)
      if (nextWeight !== weight) onPatch({ weight: nextWeight })
    } else {
      void haptics.reject()
    }
    setWeightDraft(null)
  }

  return (
    <>
      <label className="ex-field">
        <span>Name</span>
        <input
          className="ws-editor-input"
          type="text"
          maxLength={80}
          value={nameDraft ?? name}
          onFocus={() => setNameDraft(name)}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div className="ex-field">
        <span>Muscle group</span>
        <div className="ex-muscles">
          {CATEGORIES.map((item) => {
            const selected = category === item
            return (
              <button
                key={item}
                type="button"
                className={`ex-muscle ${selected ? 'sel' : ''}`}
                style={selected ? { background: muscleColor(item), borderColor: muscleColor(item) } : undefined}
                onClick={() => {
                  if (!selected) {
                    onPatch({ category: item })
                    void haptics.selection()
                  }
                }}
              >
                {categoryLabel(item)}
              </button>
            )
          })}
        </div>
      </div>

      <div className="ws-editor-row">
        <div className="ex-field">
          <span>Sets</span>
          <div className="set-stepper">
            <button type="button" aria-label="Decrease sets" {...holdStepper.bind(() => adjustSets(-1))}>
              <Icon name="minus" size={18} />
            </button>
            <strong>{sets}</strong>
            <button type="button" aria-label="Increase sets" {...holdStepper.bind(() => adjustSets(1))}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
        <div className="ex-field">
          <span>Reps</span>
          <div className="set-stepper">
            <button type="button" aria-label="Decrease reps" {...holdStepper.bind(() => adjustReps(-1))}>
              <Icon name="minus" size={18} />
            </button>
            <strong>{reps}</strong>
            <button type="button" aria-label="Increase reps" {...holdStepper.bind(() => adjustReps(1))}>
              <Icon name="plus" size={18} />
            </button>
          </div>
        </div>
      </div>

      <label className="ex-field">
        <span>Setup</span>
        <input
          className="ws-editor-input"
          type="text"
          maxLength={120}
          placeholder="Seat 4, 20°"
          value={setupDraft ?? setup}
          onFocus={() => setSetupDraft(setup)}
          onChange={(event) => setSetupDraft(event.target.value)}
          onBlur={commitSetup}
          onKeyDown={blurOnEnter}
        />
      </label>

      <label className="ex-field">
        <span>Note</span>
        <input
          className="ws-editor-input"
          type="text"
          maxLength={240}
          placeholder="Grip felt off; go slower"
          value={noteDraft ?? (variant.note ?? '')}
          onFocus={() => setNoteDraft(variant.note ?? '')}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
          onKeyDown={blurOnEnter}
        />
      </label>

      <label className="ex-field">
        <span>Weight (kg)</span>
        <input
          className="ws-editor-input"
          type="number"
          inputMode="decimal"
          min={0}
          value={weightDraft ?? String(weight)}
          onFocus={() => setWeightDraft(String(weight))}
          onChange={(event) => setWeightDraft(event.target.value)}
          onBlur={commitWeight}
          onKeyDown={blurOnEnter}
        />
      </label>

      <div className="ex-field">
        <span>Weight type</span>
        <div className="ex-segment" role="group" aria-label="Weight type">
          <button
            type="button"
            className={perHand ? '' : 'sel'}
            aria-pressed={!perHand}
            onClick={() => {
              if (perHand) {
                onPatch({ perHand: false })
                void haptics.selection()
              }
            }}
          >
            Total
          </button>
          <button
            type="button"
            className={perHand ? 'sel' : ''}
            aria-pressed={perHand}
            onClick={() => {
              if (!perHand) {
                onPatch({ perHand: true })
                void haptics.selection()
              }
            }}
          >
            Per hand
          </button>
        </div>
      </div>
    </>
  )
}

function EditableExerciseItem(props: WorkoutEditorItem & { Icon: IconComponent }) {
  const { id, variant, restSeconds, hidden, linkedPartnerName, isExpanded, canRemove, canLink, canToggleHidden, Icon } = props
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const restMinutes = Math.floor(restSeconds / 60)
  const restSecondsPart = restSeconds % 60
  const [minDraft, setMinDraft] = useState<string | null>(null)
  const [secDraft, setSecDraft] = useState<string | null>(null)
  const restSecondsRef = useRef(restSeconds)
  restSecondsRef.current = restSeconds
  const holdStepper = useHoldStepper()

  const adjustRest = (delta: number) => {
    const next = Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, restSecondsRef.current + delta))
    if (next === restSecondsRef.current) return false
    restSecondsRef.current = next
    props.onRest(next)
    return true
  }

  const muscle = muscleColor(variant.category)
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderColor: isExpanded ? `${muscle}b0` : `${muscle}52`,
    opacity: isDragging ? 0.75 : 1,
    zIndex: isDragging ? 5 : undefined,
    boxShadow: isDragging ? 'var(--shadow)' : undefined,
  }

  const commitRest = () => {
    if (minDraft === null && secDraft === null) return
    const mins = Number(minDraft ?? String(restMinutes))
    const secs = Number(secDraft ?? String(restSecondsPart))
    if (Number.isFinite(mins) && Number.isFinite(secs)) {
      const total = Math.max(0, Math.round(mins)) * 60 + Math.max(0, Math.round(secs))
      const nextRest = clampRestValue(total)
      if (nextRest !== restSeconds) props.onRest(nextRest)
    } else {
      void haptics.reject()
    }
    setMinDraft(null)
    setSecDraft(null)
  }

  return (
    <article
      ref={setNodeRef}
      style={style}
      id={`exercise-${id}`}
      className={`ws-item editing${isExpanded ? ' open' : ''}${isDragging ? ' dragging' : ''}${hidden ? ' is-hidden' : ''}`}
    >
      <div className="ws-edit-head">
        <button className="ws-edit-handle" type="button" aria-label="Reorder exercise" {...attributes} {...listeners}>
          <Icon name="grip" size={18} />
        </button>
        <button className="ws-edit-open" type="button" aria-expanded={isExpanded} onClick={props.onToggle}>
          <span className="ws-dot" style={{ background: muscle }} aria-hidden="true" />
          <span className="ws-edit-open-main">
            <strong>{variant.name}</strong>
            <small>
              {categoryLabel(variant.category)} · {variant.sets}×{variant.reps} · rest {formatTimerDuration(restSeconds)}
              {linkedPartnerName && ` · ⇄ ${linkedPartnerName}`}
              {hidden && ' · hidden'}
            </small>
          </span>
          <Icon name={isExpanded ? 'up' : 'down'} size={18} />
        </button>
      </div>

      <div className="ws-item-body" aria-hidden={!isExpanded} inert={!isExpanded}>
        <div className="ws-item-body-inner">
          <div className="ws-editor">
            <VariantFields variant={variant} onPatch={props.onVariant} Icon={Icon} />

            <div className="ex-field ex-slot-rest">
              <span>Rest time</span>
              <div className="set-stepper rest-stepper">
                <button type="button" aria-label="Decrease rest time" {...holdStepper.bind(() => adjustRest(-REST_STEP_SECONDS))}>
                  <Icon name="minus" size={18} />
                </button>
                <div className="rest-mmss">
                  <label className="set-rest-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      aria-label="Rest minutes"
                      value={minDraft ?? String(restMinutes)}
                      onFocus={() => setMinDraft(String(restMinutes))}
                      onChange={(event) => setMinDraft(event.target.value)}
                      onBlur={commitRest}
                      onKeyDown={blurOnEnter}
                    />
                    <span>m</span>
                  </label>
                  <label className="set-rest-field">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      aria-label="Rest seconds"
                      value={secDraft ?? String(restSecondsPart)}
                      onFocus={() => setSecDraft(String(restSecondsPart))}
                      onChange={(event) => setSecDraft(event.target.value)}
                      onBlur={commitRest}
                      onKeyDown={blurOnEnter}
                    />
                    <span>s</span>
                  </label>
                </div>
                <button type="button" aria-label="Increase rest time" {...holdStepper.bind(() => adjustRest(REST_STEP_SECONDS))}>
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </div>

            <div className="ex-controls">
              <button className="ex-control-btn" type="button" disabled={!canToggleHidden} onClick={props.onToggleHidden}>
                <Icon name={hidden ? 'eye' : 'eye-off'} size={16} />
                {hidden ? 'Show in workout' : 'Hide from workout'}
              </button>
              {linkedPartnerName ? (
                <div className="ex-linked">
                  <span className="ex-linked-label">
                    <Icon name="repeat" size={15} />
                    Linked to {linkedPartnerName}
                  </span>
                  <button className="ex-control-btn" type="button" onClick={props.onUnlink}>Unlink</button>
                </div>
              ) : (
                <button className="ex-control-btn" type="button" disabled={!canLink} onClick={props.onLink}>
                  <Icon name="repeat" size={15} />
                  Link another exercise
                </button>
              )}
            </div>

            <div className="ex-danger">
              <button className="ws-editor-remove" type="button" disabled={!canRemove} onClick={props.onRemove}>
                <Icon name="trash" size={18} />
                Delete exercise
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

export default function WorkoutEditorList({ items, Icon, onReorder }: WorkoutEditorListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => void haptics.dragStart()}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) onReorder(String(active.id), String(over.id))
      }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => <EditableExerciseItem key={item.id} {...item} Icon={Icon} />)}
      </SortableContext>
    </DndContext>
  )
}
