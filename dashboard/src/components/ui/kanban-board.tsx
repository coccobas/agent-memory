import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  MeasuringStrategy,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bug,
  Sparkles,
  Wrench,
  HardHat,
  FlaskConical,
  CircleHelp,
  FileText,
  Calendar,
  Inbox,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task, TaskStatus, TaskType, TaskSeverity } from '@/api/types';

function formatDueDate(dueDate: string): { text: string; variant: 'overdue' | 'soon' | 'normal' } {
  const due = new Date(dueDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diffDays = Math.ceil((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, variant: 'overdue' };
  } else if (diffDays === 0) {
    return { text: 'Today', variant: 'soon' };
  } else if (diffDays === 1) {
    return { text: 'Tomorrow', variant: 'soon' };
  } else if (diffDays <= 3) {
    return { text: `${diffDays}d`, variant: 'soon' };
  } else {
    return {
      text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      variant: 'normal',
    };
  }
}

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'open', label: 'Open' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'review', label: 'Review' },
  { id: 'done', label: 'Done' },
  { id: 'wont_do', label: "Won't Do" },
];

const TYPE_ICONS: Record<TaskType, React.ComponentType<{ className?: string }>> = {
  bug: Bug,
  feature: Sparkles,
  improvement: Wrench,
  debt: HardHat,
  research: FlaskConical,
  question: CircleHelp,
  other: FileText,
};

const PRIORITY_COLORS: Record<TaskSeverity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-500',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: 'bg-slate-500',
  open: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  blocked: 'bg-red-500',
  review: 'bg-purple-500',
  done: 'bg-green-500',
  wont_do: 'bg-zinc-600',
};

const EMPTY_STATE_MESSAGES: Record<TaskStatus, { title: string; subtitle: string }> = {
  backlog: { title: 'Backlog is empty', subtitle: 'Add tasks to plan ahead' },
  open: { title: 'Ready for work', subtitle: 'Drag tasks here to start' },
  in_progress: { title: 'Nothing in progress', subtitle: 'Pick up a task to begin' },
  blocked: { title: 'No blockers', subtitle: 'Great! Keep the momentum' },
  review: { title: 'Review queue empty', subtitle: 'Tasks pending review appear here' },
  done: { title: 'No completed tasks', subtitle: 'Finished work will show here' },
  wont_do: { title: 'Nothing declined', subtitle: 'Declined tasks appear here' },
};

interface KanbanBoardProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
}

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isOverlay?: boolean;
}

function TaskTypeIcon({ type, className }: { type: TaskType; className?: string }) {
  const Icon = TYPE_ICONS[type];
  return <Icon className={className} />;
}

function PriorityDot({ priority }: { priority: TaskSeverity }) {
  return (
    <div
      className={cn('absolute right-3 top-3 h-2 w-2 rounded-full', PRIORITY_COLORS[priority])}
      title={`Priority: ${priority}`}
    />
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  return <div className={cn('h-2.5 w-2.5 rounded-full', STATUS_COLORS[status])} />;
}

const animateLayoutChanges: AnimateLayoutChanges = () => false;

function TaskCard({ task, onClick, isOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: task.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isSortableDragging ? transition : undefined,
    opacity: isSortableDragging ? 0.4 : undefined,
  };

  const cardContent = (
    <>
      <PriorityDot priority={task.severity} />

      <div className="mb-2 flex items-center gap-2 text-xs text-subtle">
        <TaskTypeIcon type={task.taskType} className="h-3.5 w-3.5" />
        <span className="font-mono uppercase">
          {task.taskType.slice(0, 3)}-{task.id.slice(0, 6)}
        </span>
      </div>

      <h4 className="mb-3 line-clamp-2 text-sm font-medium leading-snug text-foreground">
        {task.title}
      </h4>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {task.assignee && (
            <>
              <User className="h-3.5 w-3.5" />
              <span>{task.assignee}</span>
            </>
          )}
        </div>

        {task.dueDate &&
          (() => {
            const { text, variant } = formatDueDate(task.dueDate);
            return (
              <span
                className={cn(
                  'flex items-center gap-1',
                  variant === 'overdue' && 'font-medium text-destructive',
                  variant === 'soon' && 'text-warning',
                  variant === 'normal' && 'text-muted-foreground'
                )}
              >
                <Calendar className="h-3 w-3" />
                {text}
              </span>
            );
          })()}
      </div>
    </>
  );

  if (isOverlay) {
    return (
      <div className="relative rotate-2 scale-105 cursor-grabbing rounded-lg border-2 border-primary bg-card p-4 shadow-2xl">
        {cardContent}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'group relative cursor-pointer rounded-lg border bg-card p-4',
        'border-border',
        'transition-[background-color,border-color,box-shadow] duration-150',
        'hover:border-border-focus hover:bg-card-hover',
        'hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]'
      )}
    >
      {cardContent}
    </div>
  );
}

function EmptyColumnState({ status }: { status: TaskStatus }) {
  const { title, subtitle } = EMPTY_STATE_MESSAGES[status];

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-4 rounded-full bg-card p-4">
        <Inbox className="h-6 w-6 text-subtle" />
      </div>

      <p className="mb-1 text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mb-4 text-xs text-subtle">{subtitle}</p>

      <div className="w-full rounded-lg border-2 border-dashed border-border p-4">
        <p className="text-xs text-subtle">Drop tasks here</p>
      </div>
    </div>
  );
}

interface ColumnProps {
  status: TaskStatus;
  label: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function Column({ status, label, tasks, onTaskClick }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex h-full min-w-[300px] max-w-[320px] flex-col',
        'rounded-lg bg-muted',
        'transition-[background-color,box-shadow] duration-150',
        isOver && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-muted px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusDot status={status} />
          <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        </div>
        <span className="rounded-full bg-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {tasks.length}
        </span>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
          ))}
        </SortableContext>

        {tasks.length === 0 && <EmptyColumnState status={status} />}
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, onStatusChange, onTaskClick }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const tasksByStatus = COLUMNS.reduce(
    (acc, col) => {
      acc[col.id] = tasks.filter((t) => t.status === col.id);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = over.id as string;
    let newStatus: TaskStatus | undefined;

    const isColumn = COLUMNS.some((col) => col.id === overId);
    if (isColumn) {
      newStatus = overId as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        newStatus = overTask.status;
      }
    }

    if (newStatus && newStatus !== task.status) {
      onStatusChange(taskId, newStatus);
    }
  }

  const dropAnimationConfig = null;

  const measuring = {
    droppable: {
      strategy: MeasuringStrategy.Always,
    },
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      measuring={measuring}
    >
      <div className="scrollbar-thin flex h-[calc(100vh-180px)] gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            status={col.id}
            label={col.label}
            tasks={tasksByStatus[col.id] || []}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={dropAnimationConfig}>
        {activeTask ? <TaskCard task={activeTask} onClick={() => {}} isOverlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}
