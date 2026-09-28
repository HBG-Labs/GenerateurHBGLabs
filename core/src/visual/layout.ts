import type { GridPlacement } from '../contracts/common.ts';
import type { Box } from '../contracts/render-plan.ts';
import type { NormalizedBox } from '../contracts/visual.ts';

export type VisualLayoutKind = 'stack' | 'split' | 'overlay' | 'aligned_region' | 'image_hero' | 'text_over_negative_space';

export function intersectBoxes(left: Box, right: Box): Box {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const edgeX = Math.min(left.x + left.w, right.x + right.w);
  const edgeY = Math.min(left.y + left.h, right.y + right.h);
  return { x, y, w: Math.max(0, edgeX - x), h: Math.max(0, edgeY - y) };
}

export function boxContains(container: Box, item: Box, epsilon = 0.001): boolean {
  return (
    item.x + epsilon >= container.x &&
    item.y + epsilon >= container.y &&
    item.x + item.w <= container.x + container.w + epsilon &&
    item.y + item.h <= container.y + container.h + epsilon
  );
}

export function normalizedRegionBox(region: NormalizedBox, imageBox: Box): Box {
  return {
    x: imageBox.x + region.x * imageBox.w,
    y: imageBox.y + region.y * imageBox.h,
    w: region.w * imageBox.w,
    h: region.h * imageBox.h,
  };
}

export function gridPlacementBox(
  placement: GridPlacement,
  container: Box,
  grid: { columns: number; rows: number; gutter: number },
): Box {
  const columnWidth = (container.w - grid.gutter * (grid.columns - 1)) / grid.columns;
  const rowHeight = (container.h - grid.gutter * (grid.rows - 1)) / grid.rows;
  if (placement.col + placement.col_span - 1 > grid.columns || placement.row + placement.row_span - 1 > grid.rows) {
    throw new Error('layout.grid_out_of_bounds');
  }
  return {
    x: container.x + (placement.col - 1) * (columnWidth + grid.gutter),
    y: container.y + (placement.row - 1) * (rowHeight + grid.gutter),
    w: placement.col_span * columnWidth + (placement.col_span - 1) * grid.gutter,
    h: placement.row_span * rowHeight + (placement.row_span - 1) * grid.gutter,
  };
}

export function resolveVisualLayout(
  kind: VisualLayoutKind,
  container: Box,
  options: { gap?: number; split?: number; region?: NormalizedBox; count?: number } = {},
): Box[] {
  const gap = options.gap ?? 0;
  if (kind === 'overlay') return Array.from({ length: options.count ?? 2 }, () => ({ ...container }));
  if (kind === 'aligned_region' || kind === 'text_over_negative_space') {
    if (!options.region) throw new Error(`layout.${kind}.missing_region`);
    return [normalizedRegionBox(options.region, container)];
  }
  if (kind === 'split') {
    const ratio = options.split ?? 0.5;
    const first = (container.w - gap) * ratio;
    return [
      { ...container, w: first },
      { x: container.x + first + gap, y: container.y, w: container.w - first - gap, h: container.h },
    ];
  }
  if (kind === 'image_hero') {
    const ratio = options.split ?? 0.62;
    const hero = (container.h - gap) * ratio;
    return [
      { ...container, h: hero },
      { x: container.x, y: container.y + hero + gap, w: container.w, h: container.h - hero - gap },
    ];
  }
  const count = Math.max(1, options.count ?? 1);
  const height = (container.h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    x: container.x,
    y: container.y + index * (height + gap),
    w: container.w,
    h: height,
  }));
}
