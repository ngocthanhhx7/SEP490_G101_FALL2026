export function paginationPages(page, pages) {
  if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 3) return [1, 2, 3, 'gap', pages];
  if (page >= pages - 2) return [1, 'gap', pages - 2, pages - 1, pages];
  return [1, 'gap-before', page, 'gap-after', pages];
}
