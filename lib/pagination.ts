export const DEFAULT_PAGE_SIZE = 24
export const MAX_PAGE_SIZE = 100

export type PaginationInput = {
  page?: number
  pageSize?: number
}

export type PaginatedResult<T> = {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function clampPagination(input: PaginationInput): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? DEFAULT_PAGE_SIZE)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { items, page, pageSize, total, totalPages }
}
