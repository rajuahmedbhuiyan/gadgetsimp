"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  Home,
  ImageOff,
  Pencil,
  Tags,
  Trash2,
} from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { CategoryPermissions } from "@/lib/panel/permissions";
import type { CategoryNode, CategorySortEntry } from "@/lib/api/admin/categories";
import {
  CatalogStatusBadge,
  VisibilityBadge,
} from "@/components/panel/brands/brand-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Direction = "up" | "down";

const ROOT = "__root";
const INDENT = 28;
const MAX_DEPTH = 6;

interface FlatCategory {
  node: CategoryNode;
  id: string;
  parentId: string | null;
  depth: number;
}

interface Projection {
  depth: number;
  parentId: string | null;
  insertAt: number;
  block: FlatCategory[];
  remaining: FlatCategory[];
}

function flattenTree(
  nodes: CategoryNode[],
  depth = 0,
  parentId: string | null = null,
): FlatCategory[] {
  return nodes.flatMap((node) => [
    { node, id: node.id, parentId, depth },
    ...flattenTree(node.children ?? [], depth + 1, node.id),
  ]);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function subtreeIds(items: FlatCategory[], id: string) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return new Set<string>();

  const depth = items[index]?.depth ?? 0;
  const ids = new Set<string>([id]);
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    if (!item || item.depth <= depth) break;
    ids.add(item.id);
  }
  return ids;
}

function activeBlock(items: FlatCategory[], id: string) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return [];

  const depth = items[index]?.depth ?? 0;
  const block = [items[index]!];
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const item = items[cursor];
    if (!item || item.depth <= depth) break;
    block.push(item);
  }
  return block;
}

function parentForDepth(
  items: FlatCategory[],
  insertAt: number,
  depth: number,
): string | null {
  if (depth === 0) return null;

  for (let cursor = insertAt - 1; cursor >= 0; cursor -= 1) {
    const item = items[cursor];
    if (!item) continue;
    if (item.depth === depth - 1) return item.id;
    if (item.depth < depth - 1) return null;
  }

  return null;
}

function projection(
  items: FlatCategory[],
  activeId: string,
  overId: string | null,
  offsetLeft: number,
): Projection | null {
  if (!overId) return null;

  const activeIndex = items.findIndex((item) => item.id === activeId);
  const overIndex = items.findIndex((item) => item.id === overId);
  if (activeIndex < 0 || overIndex < 0) return null;

  const blockIds = subtreeIds(items, activeId);
  if (overId !== activeId && blockIds.has(overId)) return null;

  const block = activeBlock(items, activeId);
  const remaining = items.filter((item) => !blockIds.has(item.id));
  const overIndexRemaining = remaining.findIndex((item) => item.id === overId);
  const insertAt =
    activeIndex < overIndex ? overIndexRemaining + 1 : overIndexRemaining;

  const previous = remaining[insertAt - 1];
  const next = remaining[insertAt];
  const dragDepth = Math.round(offsetLeft / INDENT);
  const minDepth = next?.depth ?? 0;
  const maxDepth = previous ? Math.min(previous.depth + 1, MAX_DEPTH) : 0;
  const depth = clamp((items[activeIndex]?.depth ?? 0) + dragDepth, minDepth, maxDepth);

  return {
    depth,
    parentId: parentForDepth(remaining, insertAt, depth),
    insertAt,
    block,
    remaining,
  };
}

function applyProjection(items: FlatCategory[], activeId: string, projected: Projection) {
  const active = items.find((item) => item.id === activeId);
  const depthDelta = projected.depth - (active?.depth ?? 0);
  const block = projected.block.map((item, index) => ({
    ...item,
    depth: item.depth + depthDelta,
    parentId: index === 0 ? projected.parentId : item.parentId,
  }));

  return [
    ...projected.remaining.slice(0, projected.insertAt),
    ...block,
    ...projected.remaining.slice(projected.insertAt),
  ];
}

function sortEntries(items: FlatCategory[]): CategorySortEntry[] {
  const counts = new Map<string, number>();

  return items.map((item) => {
    const key = item.parentId ?? ROOT;
    const sortOrder = counts.get(key) ?? 0;
    counts.set(key, sortOrder + 1);
    return {
      id: item.id,
      parentId: item.parentId,
      sortOrder,
    };
  });
}

function findSiblings(items: FlatCategory[], id: string) {
  const current = items.find((item) => item.id === id);
  if (!current) return [];
  return items.filter((item) => item.parentId === current.parentId);
}

export function CategoryTree({
  tree,
  permissions,
  busy,
  onEdit,
  onArchive,
  onToggleHome,
  onSort,
}: {
  tree: CategoryNode[];
  permissions: CategoryPermissions;
  busy: boolean;
  onEdit: (category: CategoryNode) => void;
  onArchive: (category: CategoryNode) => void;
  onToggleHome: (category: CategoryNode) => void;
  onSort: (updates: CategorySortEntry[]) => void;
}) {
  const items = useMemo(() => flattenTree(tree), [tree]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const projected =
    activeId && overId ? projection(items, activeId, overId, offsetLeft) : null;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverId(String(event.active.id));
    setOffsetLeft(0);
  }

  function onDragMove(event: DragMoveEvent) {
    setOffsetLeft(event.delta.x);
    setOverId(event.over ? String(event.over.id) : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    const nextProjection = projection(items, active, over, offsetLeft);

    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);

    if (!nextProjection || active === over) return;
    onSort(sortEntries(applyProjection(items, active, nextProjection)));
  }

  function onDragCancel() {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  }

  function nudge(category: CategoryNode, direction: Direction) {
    const siblings = findSiblings(items, category.id);
    const from = siblings.findIndex((item) => item.id === category.id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= siblings.length) return;

    const moved = arrayMove(siblings, from, to);
    onSort(
      moved.map((item, index) => ({
        id: item.id,
        parentId: item.parentId,
        sortOrder: index,
      })),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ol className={cn("grid min-w-0 gap-2 rounded-xl", busy && "opacity-60")}>
          {items.map((item) => {
            const siblings = findSiblings(items, item.id);
            const siblingIndex = siblings.findIndex((sibling) => sibling.id === item.id);
            const visualDepth =
              item.id === activeId && projected ? projected.depth : item.depth;

            return (
              <CategoryRow
                key={item.id}
                node={item.node}
                depth={visualDepth}
                first={siblingIndex === 0}
                last={siblingIndex === siblings.length - 1}
                permissions={permissions}
                onEdit={onEdit}
                onArchive={onArchive}
                onToggleHome={onToggleHome}
                onNudge={nudge}
              />
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function CategoryRow({
  node,
  depth,
  first,
  last,
  permissions,
  onEdit,
  onArchive,
  onToggleHome,
  onNudge,
}: {
  node: CategoryNode;
  depth: number;
  first: boolean;
  last: boolean;
  permissions: CategoryPermissions;
  onEdit: (category: CategoryNode) => void;
  onArchive: (category: CategoryNode) => void;
  onToggleHome: (category: CategoryNode) => void;
  onNudge: (category: CategoryNode, direction: Direction) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        paddingInlineStart: `min(${depth * INDENT}px, 42vw)`,
      }}
      className={cn("min-w-0", isDragging && "relative z-10 opacity-80")}
    >
      <article className="min-w-0 overflow-hidden rounded-lg border bg-background p-2.5 shadow-xs">
        <div className="flex min-w-0 items-start gap-2">
          {permissions.sort ? (
            <button
              type="button"
              aria-label={`Drag ${node.name}`}
              {...attributes}
              {...listeners}
              className="mt-1 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted active:cursor-grabbing"
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          ) : null}

          <span className="relative mt-1 flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
            {node.image ? (
              <Image
                src={node.image}
                alt=""
                fill
                sizes="48px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <ImageOff className="size-4 text-muted-foreground" aria-hidden />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-semibold">{node.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {node.slug}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <CatalogStatusBadge status={node.status} />
                <VisibilityBadge visibility={node.visibility} />
                {node.showInHome ? (
                  <Badge variant="outline" className="gap-1 rounded-full px-2.5 py-1 text-xs">
                    <Home className="size-3" aria-hidden />
                    Home
                  </Badge>
                ) : null}
              </div>
            </div>

            {node.description ? (
              <p className="mt-2 line-clamp-2 break-words text-sm leading-relaxed text-muted-foreground">
                {node.description}
              </p>
            ) : null}

            <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Tags className="size-3.5" aria-hidden />
                  {node.attributes?.length ?? 0} attributes
                </span>
                {node.children?.length ? <span>{node.children.length} children</span> : null}
                {depth > 0 ? <span>Level {depth + 1}</span> : null}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-1">
                {permissions.sort ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={first}
                      aria-label={`Move ${node.name} up`}
                      onClick={() => onNudge(node, "up")}
                      className="size-9 cursor-pointer rounded-lg"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={last}
                      aria-label={`Move ${node.name} down`}
                      onClick={() => onNudge(node, "down")}
                      className="size-9 cursor-pointer rounded-lg"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : null}
                {permissions.edit ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={
                        node.showInHome
                          ? `Remove ${node.name} from home`
                          : `Show ${node.name} on home`
                      }
                      onClick={() => onToggleHome(node)}
                      className={cn(
                        "size-9 cursor-pointer rounded-lg",
                        node.showInHome && "text-brand hover:text-brand",
                      )}
                    >
                      <Home className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${node.name}`}
                      onClick={() => onEdit(node)}
                      className="size-9 cursor-pointer rounded-lg"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                  </>
                ) : null}
                {permissions.remove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Archive ${node.name}`}
                    onClick={() => onArchive(node)}
                    className="size-9 cursor-pointer rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}
